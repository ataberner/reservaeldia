export async function getMyProfileStatusWithRetry({
  callable,
  user,
  retryDelayMs = 700,
}) {
  try {
    const first = await callable({});
    return first?.data || {};
  } catch (firstError) {
    if (user?.getIdToken) {
      try {
        await user.getIdToken(true);
      } catch {
        // noop
      }
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    const second = await callable({});
    return second?.data || {};
  }
}
