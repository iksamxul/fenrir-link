/* Fake answers from a host's remote and a friend's live page, for checking the app's screens in a desktop browser. */
(function () {
  var now = Date.now() / 1000;
  var host = { host: "Icarus", pack: "All the Mods 10", status: "running", ready: true, players: ["ChecoPecko", "Iksamxul", "Mogwai"], tps: 19.7, mspt: 31.2,
    startedAt: now - 5400, crashLoop: false, frozen: false, wake: [], wakeMode: "ask",
    friends: [{ name: "checo", username: "ChecoPecko", appOpen: true, inGame: true, lastSeen: now - 30, state: "playing", progress: null },
              { name: "Iksamxul", username: "Iksamxul", appOpen: true, inGame: true, lastSeen: now - 20, state: "playing", progress: null },
              { name: "Mogwai", username: "Mogwai", appOpen: true, inGame: false, lastSeen: now - 60, state: "installing", progress: 64 }],
    tasks: [], session: { title: "Friday game night", when: "Friday 21:00", weekly: true, live: false },
    doctor: { title: "Server + game + other apps do not fit in RAM", severity: "warn", more: 1 },
    activity: [{ t: now - 600, text: "Iksamxul joined the world", level: "info" }, { t: now - 5400, text: "Server is ready", level: "ok" }],
    console: [{ t: now - 60, line: "[21:00:05] [Server thread/INFO]: <ChecoPecko> that is art. do not touch it", kind: "server" },
              { t: now - 30, line: "[Connect] Iksamxul: on my way, five minutes", kind: "system" }], time: now };
  var friend = { fenrirConnect: 1, servers: [{ id: "atm10", online: true, ready: true, players: 2, names: ["ChecoPecko", "Iksamxul"], tps: 19.8 }],
    wake: { mode: "ask", asked: false }, session: { title: "Friday game night", t: now + 2 * 86400, weekly: true, live: false, answers: { "in": ["ChecoPecko"], out: [] }, mine: "" },
    chat: { on: true, lines: [{ t: now - 1500, who: "ChecoPecko", event: "joined" }, { t: now - 1440, who: "ChecoPecko", text: "anyone got spare iron? the AE2 chest is empty" },
      { t: now - 1380, who: "Iksamxul", text: "check the vault at spawn, second row" }, { t: now - 300, who: "Mogwai", text: "who built the giant cow statue" }] } };
  var names = { fenrirConnect: 1, friend: "Iksamxul", hostName: "Icarus", servers: [{ id: "atm10", name: "All the Mods 10" }] };
  window.__mock = { host: host, friend: friend };
  function reply(body, status) { return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json" } })); }
  window.fetch = function (url, opts) {
    var u = String(url), body = {};
    try { body = opts && opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    if (/gone/.test(u)) return reply({ gone: true }, 404);
    if (u.indexOf("/admin.json") > 0) return reply(host);
    if (u.indexOf("/status.json") > 0) return reply(friend);
    if (u.indexOf("/manifest.json") > 0) return reply(names);
    var m = u.match(/\/admin\/([a-z-]+)$/);
    if (m) {
      var a = m[1];
      if ((a === "stop" || a === "restart") && host.players.length && !body.force) return reply({ ok: false, error: host.players.length + " player(s) online", playersOnline: host.players.slice() });
      if (a === "stop") { host.status = "stopped"; host.players = []; }
      if (a === "start") { host.status = "running"; host.ready = true; host.startedAt = Date.now() / 1000; }
      if (a === "kick") host.players = host.players.filter(function (p) { return p !== body.name; });
      return reply({ ok: true });
    }
    if (/\/(wake|rsvp|chat)$/.test(u)) {
      if (/rsvp$/.test(u)) friend.session.mine = body.answer;
      if (/wake$/.test(u)) friend.wake.asked = true;
      if (/chat$/.test(u)) friend.chat.lines.push({ t: Date.now() / 1000, who: "Iksamxul", text: body.text });
      return reply({ ok: true });
    }
    return reply({ ok: false, error: "not found" }, 404);
  };
})();
