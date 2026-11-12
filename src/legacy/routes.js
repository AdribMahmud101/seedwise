export function parseRoute(hash = '') {
  const [page = '', rawParam] = String(hash).replace(/^#/, '').split('/', 2);
  const param = rawParam?.split(/[?#]/, 1)[0];
  try { return { page, param: param ? decodeURIComponent(param) : null }; }
  catch { return { page, param: null }; }
}
