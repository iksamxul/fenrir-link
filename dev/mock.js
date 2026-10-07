/* Fake answers from a host's remote and a friend's live page, for checking the app's screens in a desktop browser.
   ?shot=1 keeps the Doctor calm for the showcase pictures; ?case=wake adds a friend asking to play. The icons are copied
   from ../www/index.html so this page never keeps a second copy. */
(function () {
  var req = new XMLHttpRequest();
  req.open('GET', '../www/index.html', false);
  try { req.send(); } catch (e) { /* no icons: the screens still work */ }
  var m = /<svg class="sprite"[\s\S]*?<\/svg>/.exec(req.responseText || '');
  if (m) document.write(m[0]);

  var now = Date.now() / 1000;
  var q = location.search;
  var fri = new Date(); fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7 || 7)); fri.setHours(21, 0, 0, 0);  // next Friday, 21:00
  var wave = function (i, a, b) { return Math.sin(i / a) * b; };
  var points = [];
  for (var i = 0; i < 60; i++) {
    var dip = i > 34 && i < 40 ? (40 - Math.abs(37 - i) * 1.1 - 37) * 0.9 : 0;  // a short lag spike twenty minutes ago
    points.push({ t: now - 1800 + i * 30, tps: Math.min(20, 19.6 + wave(i, 3, 0.3) + dip * 0.6), mspt: 31 + wave(i, 4, 6) - dip * 4, players: i < 20 ? 2 : 3,
      rssMB: 7050 + i * 9 + wave(i, 5, 120), cpuPct: 24 + wave(i, 3, 6) });
  }
  var host = { host: 'Icarus', pack: 'All the Mods 10 8.2', status: 'running', ready: true, players: ['ChecoPecko', 'Iksamxul', 'Mogwai'], tps: 19.7, mspt: 31.2,
    startedAt: now - 5400, crashLoop: false, frozen: false, wake: /case=wake/.test(q) ? ['Kestrel'] : [], wakeMode: 'ask',
    friends: [{ name: 'checo', username: 'ChecoPecko', appOpen: true, inGame: true, lastSeen: now - 30, state: 'playing', progress: null },
              { name: 'Iksamxul', username: 'Iksamxul', appOpen: true, inGame: true, lastSeen: now - 20, state: 'playing', progress: null },
              { name: 'Mogwai', username: 'Mogwai', appOpen: true, inGame: true, lastSeen: now - 60, state: 'playing', progress: null },
              { name: 'Kestrel', username: 'Kestrel', appOpen: true, inGame: false, lastSeen: now - 40, state: 'installing', progress: 64 }],
    tasks: [], session: { title: 'Friday game night', when: 'Friday 21:00', weekly: true, live: false },
    doctor: { title: 'Server + game + other apps do not fit in RAM', severity: 'warn', more: 1 },
    activity: [{ t: now - 420, text: 'Mogwai joined the world', level: 'info' }, { t: now - 900, text: 'Kestrel asked for a hand: cannot get in', level: 'warn' },
      { t: now - 1500, text: 'Iksamxul joined the world', level: 'info' }, { t: now - 2400, text: 'Backup finished: 812 MB', level: 'ok' },
      { t: now - 3800, text: 'ChecoPecko joined the world', level: 'info' }, { t: now - 5300, text: 'Server is ready', level: 'ok' },
      { t: now - 5400, text: 'Server starting (NeoForge, 10 GB heap)', level: 'info' }, { t: now - 7200, text: 'Phone: sent a message to everyone', level: 'ok' }],
    console: [], time: now,
    perf: { points: points, heapGB: 10, rssMB: points[59].rssMB, cpuPct: 24, sysFreeGB: 9.2 },
    playing: { ChecoPecko: now - 3800, Iksamxul: now - 1500, Mogwai: now - 420 }, restartAt: null, address: 'carolyn-rna.tun.ply.gg:53864',
    whitelist: { on: true, names: ['ChecoPecko', 'Iksamxul', 'Mogwai'] }, ops: ['Iksamxul'],
    backups: { count: 14, running: false, recent: [
      { file: 'world-a.zip', sizeMB: 812.4, modified: now - 2400, tier: 'recent', note: '', check: null },
      { file: 'world-b.zip', sizeMB: 809.9, modified: now - 6000, tier: 'recent', note: 'before the mod update', check: null },
      { file: 'world-c.zip', sizeMB: 806.1, modified: now - 93600, tier: 'daily', note: '', check: null },
      { file: 'world-d.zip', sizeMB: 801.7, modified: now - 180000, tier: 'daily', note: '', check: null },
      { file: 'world-e.zip', sizeMB: 793.0, modified: now - 610000, tier: 'weekly', note: '', check: null },
      { file: 'world-f.zip', sizeMB: 780.2, modified: now - 1210000, tier: 'weekly', note: '', check: null }] },
    asks: [{ id: 'a1', name: 'Kestrel', username: 'Kestrel', kind: 'login', what: 'cannot get into the world', note: 'it says I am not white-listed', t: now - 900 }],
    note: 'Mod update tonight around 9.', horn: { text: 'Mod update tonight around 9.', t: now - 1200 },
    gameServers: [{ kind: 'valheim', name: 'Valheim', game: 'Valheim', running: true, startedAt: now - 2700, players: 2, max: 10, joinCode: '482193', busy: [] },
      { kind: 'fivem', name: 'GTA V (FiveM)', game: 'Grand Theft Auto V Enhanced', running: false, startedAt: null, players: null, max: null, joinCode: null, busy: [] }],
    builders: [{ id: 'serious-sam-2-with-minecraft', name: 'Serious Sam 2 with Minecraft', status: 'approval', n: 3, model: 'qwen3-14b',
      question: 'Build Serious Sam 2 with Minecraft now? Building runs this project\'s own build files, and they can run any program on this PC.' }] };
  if (/shot=1/.test(q)) host.doctor = null;  // the showcase pictures: a calm Doctor

  /* the console: a server that keeps talking, numbered like Fenrir's lines */
  var log = [], n = 0;
  var add = function (line, kind, t) { log.push({ n: ++n, t: t || Date.now() / 1000, line: line, kind: kind || 'server' }); if (log.length > 4000) log.shift(); };
  var stamp = function (t) { return new Date(t * 1000).toTimeString().slice(0, 8); };
  var start = now - 5400;
  ['Starting minecraft server version 1.21.1', 'Loading properties', 'Default game type: SURVIVAL', 'Preparing level "world"', 'Preparing start region for dimension minecraft:overworld',
   'Time elapsed: 18342 ms', 'Done (41.215s)! For help, type "help"'].forEach(function (s, i) { add('[' + stamp(start + i * 6) + '] [Server thread/INFO] [minecraft/MinecraftServer]: ' + s, 'server', start + i * 6); });
  add('Server is ready: friends can join', 'system', start + 50);
  var talk = [['ChecoPecko', 'anyone got spare iron? the AE2 chest is empty'], ['Iksamxul', 'check the vault at spawn, second row'], ['Mogwai', 'who built the giant cow statue'],
    ['ChecoPecko', 'that is art. do not touch it'], ['Iksamxul', 'heading to the nether hub'], ['Mogwai', 'bring blaze rods if you find any']];
  for (var k = 0; k < 90; k++) {
    var t = now - 3600 + k * 38;
    if (k % 9 === 4) add('[' + stamp(t) + '] [Server thread/WARN] [minecraft/MinecraftServer]: Can\'t keep up! Is the server overloaded? Running 2034ms or 40 ticks behind', 'server', t);
    else if (k % 5 === 1) { var c = talk[k % talk.length]; add('[' + stamp(t) + '] [Server thread/INFO] [minecraft/MinecraftServer]: <' + c[0] + '> ' + c[1], 'server', t); }
    else if (k === 30) add('Backup finished: world-a.zip (812 MB)', 'system', t);
    else add('[' + stamp(t) + '] [Server thread/INFO] [minecraft/MinecraftServer]: [Not Secure] ' + ['ChecoPecko', 'Iksamxul', 'Mogwai'][k % 3] + ' has made the advancement [' + ['Hot Stuff', 'Ice Bucket Challenge', 'Not Today, Thank You', 'Monster Hunter'][k % 4] + ']', 'server', t);
  }
  setInterval(function () {
    var c = talk[Math.floor(Math.random() * talk.length)];
    add('[' + stamp(Date.now() / 1000) + '] [Server thread/INFO] [minecraft/MinecraftServer]: <' + c[0] + '> ' + c[1], 'server');
  }, 4000);

  var pics = { 'shot-1.jpg': 'gallery/shot-1.jpg', 'shot-2.jpg': 'gallery/shot-2.jpg', 'shot-3.jpg': 'gallery/shot-3.jpg', 'shot-4.jpg': 'gallery/shot-4.jpg' };
  window.__fenrirLinkDev = { picture: function (file) { return pics[file] || file; } };
  var friend = { fenrirConnect: 1, servers: [{ id: 'atm10', online: true, ready: true, players: 3, names: ['ChecoPecko', 'Iksamxul', 'Mogwai'], tps: 19.8, address: 'carolyn-rna.tun.ply.gg:53864' }],
    wake: { mode: 'ask', asked: false, declined: false, pending: [] }, session: { title: 'Friday game night', t: fri.getTime() / 1000, weekly: true, live: false, answers: { 'in': ['ChecoPecko', 'Mogwai'], out: [] }, mine: '' },
    note: 'Mod update tonight around 9.', horn: { text: 'Mod update tonight around 9.', t: now - 1200 }, maintenance: null, map: true,
    chat: { on: true, lines: [{ t: now - 3800, who: 'ChecoPecko', event: 'joined' }, { t: now - 3500, who: 'ChecoPecko', text: 'anyone got spare iron? the AE2 chest is empty' },
      { t: now - 3400, who: 'Iksamxul', text: 'check the vault at spawn, second row' }, { t: now - 1500, who: 'Iksamxul', event: 'joined' },
      { t: now - 1200, who: 'Iksamxul', event: 'advancement', text: 'Hot Stuff' }, { t: now - 600, who: 'Mogwai', text: 'who built the giant cow statue' },
      { t: now - 420, who: 'Mogwai', event: 'joined' }, { t: now - 300, who: 'ChecoPecko', text: 'that is art. do not touch it' },
      { t: now - 200, who: 'Iksamxul', text: 'heading to the nether hub, back in ten', via: 'connect' }, { t: now - 90, who: 'Mogwai', event: 'died', text: 'was blown up by Creeper' }] },
    around: [{ name: 'Kestrel', doing: 'installing the pack (64%)' }],
    week: { text: 'This week: 31 h in the world over 12 sessions, 2 new players, 19 deaths. Busiest night: Friday.' },
    records: [{ id: 'time', label: 'Most time in the world', name: 'ChecoPecko', value: '42 h 10 min' }, { id: 'km', label: 'Furthest travelled', name: 'Iksamxul', value: '131.2 km' },
      { id: 'deaths', label: 'Most deaths', name: 'Mogwai', value: '27' }, { id: 'mobs', label: 'Most mobs', name: 'ChecoPecko', value: '3,204' }],
    you: { name: 'Iksamxul', seconds: 15600, sessions: 4, deaths: 3, last: { start: now - 90000, end: now - 82000, title: 'Session' }, text: '4 h 20 min in 4 sessions, 3 deaths' },
    asks: [{ id: 'q1', kind: 'death', note: 'fell into lava with the good pickaxe', t: now - 86400, done: true, reply: 'Your things are back as they were at 21:10. Have a look.', doneT: now - 84000 }],
    gallery: [{ file: 'shot-1.jpg', friend: 'Iksamxul', t: now - 900, caption: 'the nether hub at last' }, { file: 'shot-2.jpg', friend: 'ChecoPecko', t: now - 2400, caption: 'the cow statue is art' },
      { file: 'shot-3.jpg', friend: 'Mogwai', t: now - 7200, caption: 'sunrise over the base' }, { file: 'shot-4.jpg', friend: 'Iksamxul', t: now - 90000, caption: '' }] };
  var names = { fenrirConnect: 1, friend: 'Iksamxul', hostName: 'Icarus', servers: [{ id: 'atm10', name: 'All the Mods 10', mc: '1.21.1', loader: 'NeoForge', mods: 452, totalBytes: 1352000000 }] };
  window.__mock = { host: host, friend: friend, log: log };

  function reply(body, status) { return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } })); }
  function later(ms, body) { return new Promise(function (ok) { setTimeout(function () { ok(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })); }, ms); }); }
  window.fetch = function (url, opts) {
    var u = String(url), body = {};
    try { body = opts && opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    if (/gone/.test(u)) return reply({ gone: true }, 404);
    if (u.indexOf('/admin.json') > 0) { host.time = Date.now() / 1000; return later(60 + Math.random() * 90, host); }
    if (u.indexOf('/log.json') > 0) {
      var after = +((/after=(\d+)/.exec(u) || [])[1] || 0);
      var rows = after ? log.filter(function (e) { return e.n > after; }) : log.slice(-250);
      rows = rows.slice(-250);
      return reply({ lines: rows, last: rows.length ? rows[rows.length - 1].n : after, top: n, time: Date.now() / 1000 });
    }
    if (u.indexOf('/status.json') > 0) return later(60 + Math.random() * 90, friend);
    if (u.indexOf('/manifest.json') > 0) return reply(names);
    var a = (/\/admin\/([a-z-]+)$/.exec(u) || [])[1];
    if (a) {
      if ((a === 'stop' || a === 'restart') && host.players.length && !body.force) return reply({ ok: false, error: host.players.length + ' player(s) online', playersOnline: host.players.slice() });
      if (a === 'stop') { host.status = 'stopped'; host.players = []; host.playing = {}; host.perf = { points: [], heapGB: 10 }; add('Server stopped', 'system'); }
      if (a === 'start') { host.status = 'running'; host.ready = true; host.startedAt = Date.now() / 1000; add('Server starting', 'system'); }
      if (a === 'kick') { host.players = host.players.filter(function (p) { return p !== body.name; }); add(body.name + ' left the game', 'server'); }
      if (a === 'say') add('> say ' + body.text, 'input');  // as Fenrir logs what it types: "> cmd"
      if (a === 'command') {
        add('> ' + body.text, 'input');
        if (body.text === 'list') add('[' + stamp(Date.now() / 1000) + '] [Server thread/INFO] [minecraft/MinecraftServer]: There are ' + host.players.length + ' of a max of 20 players online: ' + host.players.join(', '), 'server');
        else if (body.text === 'save-all') add('[' + stamp(Date.now() / 1000) + '] [Server thread/INFO] [minecraft/MinecraftServer]: Saved the game', 'server');
        else add('[' + stamp(Date.now() / 1000) + '] [Server thread/INFO] [minecraft/MinecraftServer]: Done', 'server');
      }
      if (a === 'backup') { host.backups.running = true; setTimeout(function () { host.backups.running = false; host.backups.count++; host.backups.recent.unshift({ file: 'world-new.zip', sizeMB: 813.0, modified: Date.now() / 1000, tier: 'recent', note: '', check: null }); host.backups.recent.length = 6; }, 5000); }
      if (a === 'whitelist-add') host.whitelist.names = host.whitelist.names.concat([body.name]).sort(function (x, y) { return x.toLowerCase() < y.toLowerCase() ? -1 : 1; });
      if (a === 'whitelist-remove') host.whitelist.names = host.whitelist.names.filter(function (x) { return x !== body.name; });
      if (a === 'ask-whitelist') { host.whitelist.names = host.whitelist.names.concat(['Kestrel']); host.asks = host.asks.filter(function (x) { return x.id !== body.id; }); }
      if (a === 'ask-done') host.asks = host.asks.filter(function (x) { return x.id !== body.id; });
      if (a === 'wake-mode') host.wakeMode = body.mode;
      if (a === 'note') { host.note = body.text; return reply({ ok: true, note: body.text }); }
      if (a === 'horn') { host.horn = { text: host.note, t: Date.now() / 1000 }; }
      if (a === 'wake-start' || a === 'wake-dismiss') host.wake = [];
      if (a === 'builder-answer') {
        var bd = host.builders.filter(function (x) { return x.id === body.id; })[0];
        if (!bd || bd.status !== 'approval' || bd.n !== body.n) return reply({ ok: false, error: 'That question has passed: see what the builder asks now.' });
        bd.status = 'working'; bd.question = null; bd.n = null;
      }
      if (a === 'game-start' || a === 'game-stop') {
        var gsv = host.gameServers.filter(function (x) { return x.kind === body.server; })[0];
        if (!gsv) return reply({ ok: false, error: 'That server is not set up on the PC.' });
        if (a === 'game-stop' && gsv.players && !body.force) return reply({ ok: false, error: gsv.players + ' playing', playersOnline: [gsv.players + ' on the ' + gsv.name + ' server'] });
        gsv.running = a === 'game-start'; gsv.startedAt = gsv.running ? Date.now() / 1000 : null; gsv.players = gsv.running ? 0 : null; gsv.max = gsv.running ? 10 : null;
      }
      return later(250, { ok: true });
    }
    if (/\/(wake|rsvp|chat|ask|photo)$/.test(u)) {
      if (/rsvp$/.test(u)) friend.session.mine = body.answer;
      if (/wake$/.test(u)) friend.wake.asked = true;
      if (/chat$/.test(u)) friend.chat.lines.push({ t: Date.now() / 1000, who: 'Iksamxul', text: body.text, via: 'connect' });
      if (/ask$/.test(u)) friend.asks.push({ id: 'q' + Date.now(), kind: body.kind, note: body.note, t: Date.now() / 1000, done: false });
      if (/photo$/.test(u)) { var f = 'data:image/jpeg;base64,' + body.data; friend.gallery.unshift({ file: f, friend: 'Iksamxul', t: Date.now() / 1000, caption: body.caption }); }
      return later(250, { ok: true, state: 'asked' });
    }
    return reply({ ok: false, error: 'not found' }, 404);
  };
})();
