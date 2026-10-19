export function moveBefore(
  ids: string[],
  moving: string,
  target: string,
): string[] {
  if (moving === target || !ids.includes(moving) || !ids.includes(target))
    return ids;
  const result = ids.filter((id) => id !== moving);
  result.splice(result.indexOf(target), 0, moving);
  return result;
}
