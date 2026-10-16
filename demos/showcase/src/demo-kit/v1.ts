export const version = '1.0.0';
export const tag = 'host';

export function describe(): string {
  return `linkkit v${version} · ${tag}`;
}

export default { version, tag, describe };
