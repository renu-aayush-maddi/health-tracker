// Read and immutably write values by dotted path, e.g. "medicines.0.name".

export function getIn(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setIn(obj, path, value) {
  const [key, ...rest] = path.split('.');
  const container = Array.isArray(obj) ? [...obj] : { ...obj };
  container[key] = rest.length
    ? setIn(obj?.[key] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join('.'), value)
    : value;
  return container;
}
