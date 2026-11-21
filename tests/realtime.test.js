const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { Server } = require("socket.io");
const { io: connect } = require("socket.io-client");
const { attachRealtime } = require("../src/realtime");

test("updates reach only the rooms that watch them", async () => {
  const server = http.createServer();
  const io = new Server(server);
  const { publish } = attachRealtime(io);
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;

  const watcherA = connect(url, { transports: ["websocket"] }); // watches department 1
  const watcherB = connect(url, { transports: ["websocket"] }); // watches department 2
  await Promise.all([watcherA, watcherB].map((s) => new Promise((r) => s.on("connect", r))));
  watcherA.emit("watch", "department:1");
  watcherB.emit("watch", "department:2");
  watcherB.emit("watch", "not-a-real-room"); // ignored
  await new Promise((r) => setTimeout(r, 100));

  const gotB = [];
  watcherB.on("doctor:update", (m) => gotB.push(m));
  const received = new Promise((r) => watcherA.on("doctor:update", r));

  publish({ id: 7, department: { id: 1 }, currentToken: 12 }, { announce: true });
  const msg = await received;
  assert.equal(msg.doctor.currentToken, 12);
  assert.equal(msg.announce, true);

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(gotB.length, 0, "department 2 should not get department 1's update");

  watcherA.close();
  watcherB.close();
  io.close();
  server.close();
});
