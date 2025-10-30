export type CreateAuthChallengeType = {
  address: string;
  nonce: string;
  domain: string;
  message: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type SignInResultType = {
  userId: string;
  roles: string[];
  connectedAddress: string;
  custodialAddress: string;
  created: boolean;
};

export type SiwsMessageType = {
  domain: string;
  address: string;
  statement: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};
