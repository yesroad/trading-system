const snapshotKeys = {
  all: ['snapshot'] as const,
  byForce: (force: boolean) => [...snapshotKeys.all, { force }] as const,
};

export default snapshotKeys;
