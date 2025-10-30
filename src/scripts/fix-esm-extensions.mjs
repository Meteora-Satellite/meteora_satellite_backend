import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const JS_IMPORT_RE = /((?:import|export)\s+(?:[^'"]*from\s+)?)(['"])(\.(?:\.|\/)[^'"]+?)(['"])/g;

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		const p = join(dir, e.name);
		if (e.isDirectory()) await walk(p);
		else if (e.isFile() && p.endsWith('.js')) await fixFile(p);
	}
}

async function fixFile(file) {
	let s = await fs.readFile(file, 'utf8');
	let changed = false;
	s = s.replace(JS_IMPORT_RE, (_m, pre, q1, spec, q2) => {
		// якщо вже є .js або .json — не чіпаємо
		if (spec.endsWith('.js') || spec.endsWith('.json')) return pre + q1 + spec + q2;
		// додамо .js
		changed = true;
		return pre + q1 + spec + '.js' + q2;
	});
	if (changed) await fs.writeFile(file, s, 'utf8');
}

await walk(DIST);
console.log('ESM specifiers fixed.');
