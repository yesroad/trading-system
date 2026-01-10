console.log("[kis-collector] started");

setInterval(() => {
  console.log("[kis-collector] heartbeat", new Date().toISOString());
}, 1000);
