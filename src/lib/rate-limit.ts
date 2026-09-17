const buckets = new Map<string, { count: number; expires: number }>();
let active = 0;
export function acquire(key: string, now = Date.now()) {
  for (const [id, b] of buckets) if (b.expires <= now) buckets.delete(id);
  const bucket = buckets.get(key) ?? { count: 0, expires: now + 3600000 };
  const global = buckets.get("__global") ?? {
    count: 0,
    expires: now + 3600000,
  };
  if (
    bucket.count >= 5 ||
    global.count >= 30 ||
    active >= 2 ||
    buckets.size >= 5000
  )
    return null;
  bucket.count++;
  global.count++;
  buckets.set(key, bucket);
  buckets.set("__global", global);
  active++;
  let done = false;
  return () => {
    if (!done) {
      active--;
      done = true;
    }
  };
}
