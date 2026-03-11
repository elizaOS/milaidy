const fs = require('fs');
const path = require('path');
function addKeys(file, keys) {
  const p = path.join(process.cwd(), file);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  Object.assign(data, keys);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

const en = {
  "game.agentActivity": "Agent Activity",
  "common.refresh": "Refresh",
  "common.hide": "Hide",
  "game.commandSent": "Command sent to agent.",
  "game.noActiveSession": "No active game session.",
  "game.backToApps": "Back to Apps",
  "game.noAgentActivity": "No agent activity yet.",
  "game.connected": "Connected",
  "game.connecting": "Connecting...",
  "game.disconnected": "Disconnected",
  "game.showLogs": "Show Logs",
  "game.hideLogs": "Hide Logs",
  "game.stopCapture": "Stop Capture",
  "game.retakeCapture": "Retake Capture",
  "game.unpinOverlay": "Unpin Overlay",
  "game.keepOnTop": "Keep on Top",
  "game.openInNewTab": "Open in New Tab",
  "game.stopping": "Stopping...",
  "game.stop": "Stop"
};

const zh = {
  "game.agentActivity": "代理活动",
  "common.refresh": "刷新",
  "common.hide": "隐藏",
  "game.commandSent": "命令已发送给代理。",
  "game.noActiveSession": "没有活跃的游戏会话。",
  "game.backToApps": "返回应用",
  "game.noAgentActivity": "暂无代理活动。",
  "game.connected": "已连接",
  "game.connecting": "连接中...",
  "game.disconnected": "已断开",
  "game.showLogs": "显示日志",
  "game.hideLogs": "隐藏日志",
  "game.stopCapture": "停止捕获",
  "game.retakeCapture": "重新捕获",
  "game.unpinOverlay": "取消固定层",
  "game.keepOnTop": "保持置顶",
  "game.openInNewTab": "在新标签页打开",
  "game.stopping": "停止中...",
  "game.stop": "停止"
};

const ko = {
  "game.agentActivity": "에이전트 활동",
  "common.refresh": "새로고침",
  "common.hide": "숨기기",
  "game.commandSent": "에이전트에게 명령을 보냈습니다.",
  "game.noActiveSession": "활성화된 게임 세션이 없습니다.",
  "game.backToApps": "앱으로 돌아가기",
  "game.noAgentActivity": "아직 에이전트 활동이 없습니다.",
  "game.connected": "연결됨",
  "game.connecting": "연결 중...",
  "game.disconnected": "연결 끊김",
  "game.showLogs": "로그 보기",
  "game.hideLogs": "로그 숨기기",
  "game.stopCapture": "캡처 중지",
  "game.retakeCapture": "다시 캡처",
  "game.unpinOverlay": "오버레이 고정 해제",
  "game.keepOnTop": "항상 위로",
  "game.openInNewTab": "새 탭에서 열기",
  "game.stopping": "중지 중...",
  "game.stop": "중지"
};

const es = {
  "game.agentActivity": "Actividad del Agente",
  "common.refresh": "Actualizar",
  "common.hide": "Ocultar",
  "game.commandSent": "Comando enviado al agente.",
  "game.noActiveSession": "No hay sesión de juego activa.",
  "game.backToApps": "Volver a Aplicaciones",
  "game.noAgentActivity": "Aún no hay actividad del agente.",
  "game.connected": "Conectado",
  "game.connecting": "Conectando...",
  "game.disconnected": "Desconectado",
  "game.showLogs": "Mostrar Registros",
  "game.hideLogs": "Ocultar Registros",
  "game.stopCapture": "Detener Captura",
  "game.retakeCapture": "Volver a Capturar",
  "game.unpinOverlay": "Desanclar Superposición",
  "game.keepOnTop": "Mantener Encima",
  "game.openInNewTab": "Abrir en Nueva Pestaña",
  "game.stopping": "Deteniendo...",
  "game.stop": "Detener"
};

const pt = {
  "game.agentActivity": "Atividade do Agente",
  "common.refresh": "Atualizar",
  "common.hide": "Ocultar",
  "game.commandSent": "Comando enviado ao agente.",
  "game.noActiveSession": "Nenhuma sessão de jogo ativa.",
  "game.backToApps": "Voltar aos Aplicativos",
  "game.noAgentActivity": "Nenhuma atividade do agente ainda.",
  "game.connected": "Conectado",
  "game.connecting": "Conectando...",
  "game.disconnected": "Desconectado",
  "game.showLogs": "Mostrar Logs",
  "game.hideLogs": "Ocultar Logs",
  "game.stopCapture": "Parar Captura",
  "game.retakeCapture": "Refazer Captura",
  "game.unpinOverlay": "Desafixar Sobreposição",
  "game.keepOnTop": "Manter no Topo",
  "game.openInNewTab": "Abrir em Nova Guia",
  "game.stopping": "Parando...",
  "game.stop": "Parar"
};

addKeys('apps/app/src/i18n/locales/en.json', en);
addKeys('apps/app/src/i18n/locales/zh-CN.json', zh);
addKeys('apps/app/src/i18n/locales/ko.json', ko);
addKeys('apps/app/src/i18n/locales/es.json', es);
addKeys('apps/app/src/i18n/locales/pt.json', pt);
