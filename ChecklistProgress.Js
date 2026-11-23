(function (root) {
  const calculateProgress = (tasks, state) => {
    const completedCount = tasks.filter((task) => state[task.id]).length;
    const percentage = tasks.length === 0
      ? 0
      : Math.round((completedCount / tasks.length) * 100);

    return { completedCount, percentage };
  };

  const api = { calculateProgress };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.DespliegueKevinProgress = api;
  }
})(globalThis);
