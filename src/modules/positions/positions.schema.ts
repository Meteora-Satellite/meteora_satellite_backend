import { z } from 'zod';
import {
  CLAIM_FEES_MODES,
  REBALANCE_TYPES,
  STRATEGY_TYPES
} from '@common/constants';
import { registry } from '@common/openapi';

export const feesModeZ = z.nativeEnum(CLAIM_FEES_MODES).openapi({ description: 'Fee handling mode' });
export const strategyTypeZ = z.nativeEnum(STRATEGY_TYPES).openapi({ description: 'Strategy type' });
export const rebalanceTypeZ = z.nativeEnum(REBALANCE_TYPES).openapi({ description: 'Rebalance type' });

export const takeProfitSchema = z.object({
  takeProfitPrice: z.string().min(1).optional(),
  stopLossPrice: z.string().min(1).optional(),
}).strict().openapi('TakeProfitConfig');

export const rebalanceSchema = z.object({
  strategy: strategyTypeZ,
  type: rebalanceTypeZ,
  stopRebalanceMinimumPrice: z.string().min(1).optional(),
  stopRebalanceMaximumPrice: z.string().min(1).optional()
}).strict().openapi('RebalanceConfig');

export const feesSchema = z.object({
  interval: z.number().int().positive(),
  mode: feesModeZ,
  reinvestStrategy: strategyTypeZ.optional(),
}).strict().refine(
  b => b.mode !== CLAIM_FEES_MODES.reinvest || b.reinvestStrategy != null,
  {
    path: ['reinvestStrategy'],
    message: '"reinvestStrategy" is required when mode is "reinvest"',
  }
).openapi('FeesConfig');

export const createPositionBody = z.object({
  poolId: z.string().min(1),
  solAmount: z.string().min(1),
  strategyType: strategyTypeZ,
  takeProfitConfig: takeProfitSchema.optional(),
  rebalanceConfig: rebalanceSchema.optional(),
  feesConfig: feesSchema.optional()
}).strict().openapi('CreatePositionBody');

export const positionDTO = z.object({
  id: z.string(),
  poolId: z.string(),
  isActive: z.boolean(),
  solAmount: z.string(),
  strategyType: strategyTypeZ,
  takeProfitConfig: takeProfitSchema.nullish(),
  rebalanceConfig: rebalanceSchema.nullish(),
  feesConfig: feesSchema.nullish(),
  createdAt: z.string().datetime().or(z.date()),
  updatedAt: z.string().datetime().or(z.date())
}).openapi('PositionDTO');

export const listPositionsQuery = z.object({
  poolId: z.string().min(1).optional(),
  strategyType: strategyTypeZ.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt','updatedAt']).default('createdAt'),
  order: z.enum(['asc','desc']).default('desc')
}).strict().openapi('ListPositionsQuery');

export type CreatePositionBody = z.infer<typeof createPositionBody>;
export type ListPositionsQuery = z.infer<typeof listPositionsQuery>;

registry.registerPath({
  method: 'post',
  path: '/positions',
  description: 'Create a new position (no on-chain actions yet)',
  summary: 'Create position',
  tags: ['Positions'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: createPositionBody }
      }
    }
  },
  responses: {
    201: {
      description: 'Position created',
      content: { 'application/json': { schema: z.object({ ok: z.literal(true), data: positionDTO }) } }
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/positions',
  description: 'List active positions for the authenticated user',
  summary: 'List positions',
  tags: ['Positions'],
  security: [{ bearerAuth: [] }],
  request: {
    query: listPositionsQuery
  },
  responses: {
    200: {
      description: 'List of positions',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.object({
              items: z.array(positionDTO),
              page: z.number(),
              limit: z.number(),
              total: z.number(),
            })
          })
        }
      }
    },
    401: { description: 'Unauthorized' }
  }
});

// Remove position's liquidity
export const removeLiquidityParams = z.object({
  positionId: z.string().min(1),
});

export const removeLiquidityQuery = z.object({
  percentage: z.coerce.number().gt(0).lte(100), // (0,100]
});

export type RemoveLiquidityParams = z.infer<typeof removeLiquidityParams>;
export type RemoveLiquidityQuery  = z.infer<typeof removeLiquidityQuery>;

registry.registerPath({
  method: 'delete',
  path: '/positions/{positionId}/liquidity',
  tags: ['Positions'],
  summary: 'Remove liquidity from a position',
  description: 'Remove a percentage of liquidity from an active position and claim all accrued fees.',
  request: {
    params: removeLiquidityParams,
    query: removeLiquidityQuery
  },
  responses: {
    200: {
      description: 'Position liquidity removed',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.null()
          })
        }
      }
    },
    404: { description: 'Position not found' }
  },
  security: [{ bearerAuth: [] }]
})

// Close position
export const closePositionParams = z.object({
  positionId: z.string().min(1),
});

export type ClosePositionParams = z.infer<typeof closePositionParams>;

registry.registerPath({
  method: 'delete',
  path: '/positions/{positionId}',
  tags: ['Positions'],
  summary: 'Close a position',
  description: 'Close opened position, remove all liquidity and claim fees.',
  security: [{ bearerAuth: [] }],
  request: { params: closePositionParams },
  responses: {
    200: { description: 'Closed', content: { 'application/json': { schema: positionDTO } } },
    404: { description: 'Active position not found' }
  }
});


// Claim fees
export const claimFeesParams = z.object({
  positionId: z.string().min(1),
});

export const claimFeesBody = z.object({
  addLiquidity: z.boolean().default(false),
  swap: z.boolean().default(false),
  strategyType: strategyTypeZ.optional()
}).superRefine((b, ctx) => {
  const count = Number(b.addLiquidity) + Number(b.swap);
  if (count > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Exactly one of addLiquidity or swap can be true',
      path: ['addLiquidity']
    });
  }
  if (b.addLiquidity && !b.strategyType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'strategyType is required when addLiquidity is true',
      path: ['strategyType']
    });
  }
});

export type ClaimFeesParams = z.infer<typeof claimFeesParams>;
export type ClaimFeesBody   = z.infer<typeof claimFeesBody>;

registry.registerPath({
  method: 'post',
  path: '/positions/{positionId}/claim_fees',
  tags: ['Positions'],
  summary: 'Claim fees from a position',
  description: 'Exactly one of addLiquidity or swap can be true. If addLiquidity is true, strategyType is required.',
  security: [{ bearerAuth: [] }],
  request: {
    params: claimFeesParams,
    body: { content: { 'application/json': { schema: claimFeesBody } } }
  },
  responses: {
    200: {
      description: 'Acknowledged',
      content: { 'application/json': { schema: z.object({
            ok: z.literal(true),
            data: z.object({
              positionId: z.string(),
              poolId: z.string(),
              action: z.enum(['addLiquidity','swap']),
              strategyType: z.nativeEnum(STRATEGY_TYPES).optional()
            })
          }) } }
    },
    404: { description: 'Active position not found' }
  }
});


// Position's rebalance
export const rebalanceParams = z.object({
  positionId: z.string().min(1),
});

export const rebalanceBody = z.object({
  strategyType: strategyTypeZ,
});

export type RebalanceParams = z.infer<typeof rebalanceParams>;
export type RebalanceBody   = z.infer<typeof rebalanceBody>;

registry.registerPath({
  method: 'post',
  path: '/positions/{positionId}/rebalance',
  tags: ['Positions'],
  summary: 'Request position rebalance',
  description: 'Queues a rebalance using the provided strategyType.',
  security: [{ bearerAuth: [] }],
  request: {
    params: rebalanceParams,
    body: { content: { 'application/json': { schema: rebalanceBody } } }
  },
  responses: {
    200: {
      description: 'Acknowledged',
      content: { 'application/json': { schema: z.object({
            ok: z.literal(true),
            data: z.object({
              positionId: z.string(),
              poolId: z.string(),
              requestedStrategy: z.nativeEnum(STRATEGY_TYPES)
            })
          })}}
    },
    404: { description: 'Active position not found' }
  }
});

// Update position's settings
export const updatePositionParams = z.object({
  positionId: z.string().min(1),
});

export const updatePositionBody = z.object({
  takeProfitConfig: takeProfitSchema.nullable().optional(),   // allow null to clear
  rebalanceConfig: rebalanceSchema.nullable().optional(),
  feesConfig: feesSchema.nullable().optional(),
}).refine(
  b => b.takeProfitConfig !== undefined || b.rebalanceConfig !== undefined || b.feesConfig !== undefined,
  { message: 'Provide at least one of takeProfitConfig, rebalanceConfig, or feesConfig' }
);

export type UpdatePositionParams = z.infer<typeof updatePositionParams>;
export type UpdatePositionBody   = z.infer<typeof updatePositionBody>;

registry.registerPath({
  method: 'patch',
  path: '/positions/{positionId}',
  tags: ['Positions'],
  summary: 'Update position settings',
  description: 'Partially update takeProfitConfig, rebalanceConfig, and/or feesConfig. Use null to clear a section.',
  security: [{ bearerAuth: [] }],
  request: {
    params: updatePositionParams,
    body: { content: { 'application/json': { schema: updatePositionBody } } }
  },
  responses: {
    200: {
      description: 'Updated position',
      content: { 'application/json': { schema: z.object({ ok: z.literal(true), data: z.any() }) } }
    },
    404: { description: 'Position not found' }
  }
});
