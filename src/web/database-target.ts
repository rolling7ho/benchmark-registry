export function sanitizeDatabaseTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const port = url.port === '' ? '5432' : url.port;
    return `${url.hostname}:${port}${url.pathname}`;
  } catch {
    return 'Unavailable';
  }
}
