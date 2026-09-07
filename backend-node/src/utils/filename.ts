import path from 'node:path';

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.').replace(/^\.+/, '').slice(0, 255) || 'file';
}

export function resolveSecurePath(base: string, userPath: string): string {
  const sanitized = sanitizeFilename(path.basename(userPath));
  const resolved = path.resolve(base, sanitized);
  if (!resolved.startsWith(path.resolve(base))) throw new Error('Path traversal blocked');
  return resolved;
}

export function normalisasiNama(nama: string): string {
  return nama.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
