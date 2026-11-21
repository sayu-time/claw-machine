// 인터넷 중계(공개 MQTT 브로커)로 PC 화면과 폰을 연결합니다.
// 같은 와이파이가 아니어도, 폰이 LTE/5G여도 동작합니다.
window.ClawNet = (() => {
  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const PREFIX = 'clawgame-v1/';

  // role: 'host' | 'ctl'
  function open(room, role, handlers) {
    const inbox = PREFIX + room + (role === 'host' ? '/c2h' : '/h2c');
    const outbox = PREFIX + room + (role === 'host' ? '/h2c' : '/c2h');
    let client = null, idx = 0, online = false;

    function start() {
      const url = BROKERS[idx % BROKERS.length];
      client = mqtt.connect(url, {
        clientId: 'claw_' + role + '_' + Math.random().toString(36).slice(2, 10),
        clean: true, keepalive: 30, reconnectPeriod: 0, connectTimeout: 6000,
      });
      let gotConnect = false;
      client.on('connect', () => {
        gotConnect = true;
        client.subscribe(inbox, { qos: 0 }, () => { online = true; handlers.onOpen && handlers.onOpen(); });
      });
      client.on('message', (topic, payload) => {
        try { handlers.onMessage(JSON.parse(payload.toString())); } catch {}
      });
      const fail = () => {
        if (client._dead) return;
        client._dead = true;
        online = false;
        try { client.end(true); } catch {}
        handlers.onClose && handlers.onClose();
        if (!gotConnect) idx++;           // 접속 실패 시 다음 브로커로
        setTimeout(start, gotConnect ? 1000 : 300);
      };
      client.on('close', fail);
      client.on('error', fail);
    }
    start();

    return {
      send(obj) { if (online && client) client.publish(outbox, JSON.stringify(obj), { qos: 0 }); },
      get online() { return online; },
    };
  }

  return { open };
})();
