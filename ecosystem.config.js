/**
 * PM2 Ecosystem - Trading System
 *
 * 코인 자동매매 최소 구성 (KRW-BTC, Upbit)
 *
 * 실행:
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * 중단:
 *   pm2 stop all
 *
 * 로그:
 *   pm2 logs [service-name]
 */

module.exports = {
  apps: [
    // ──────────────────────────────────────────────────────────
    // 1. Upbit Collector — 코인 시세 수집 (24시간 루프)
    // ──────────────────────────────────────────────────────────
    {
      name: 'upbit-collector',
      script: 'dist/index.js',
      cwd: './services/upbit-collector',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },
    },

    // ──────────────────────────────────────────────────────────
    // 2. YF Collector — SPY 시세 수집 (SPY MA200 필터 전용)
    //    US 장중에만 동작 (자체 장시간 가드 내장)
    // ──────────────────────────────────────────────────────────
    {
      name: 'yf-collector',
      script: 'dist/index.js',
      cwd: './services/yf-collector',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },
    },

    // ──────────────────────────────────────────────────────────
    // 3. Trade Executor — 신호 감지 → 실주문 (24시간 루프)
    //    LOOP_MODE=true, DRY_RUN=false, EXECUTE_MARKETS=CRYPTO
    // ──────────────────────────────────────────────────────────
    {
      name: 'trade-executor',
      script: 'dist/index.js',
      cwd: './services/trade-executor',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },

    // ──────────────────────────────────────────────────────────
    // 4. Portfolio Signal — 신호 생성 (매일 08:00 KST = 23:00 UTC)
    //    --no-dry-run: trading_signals DB INSERT 활성화
    // ──────────────────────────────────────────────────────────
    {
      name: 'portfolio-signal',
      script: 'dist/cli.js',
      cwd: './services/backtest-engine',
      args: [
        'portfolio-signal',
        '--symbols', 'KRW-BTC',
        '--crypto-strategy', 'bb-squeeze',
        '--spy-filter',
        '--symbol-ma-filter',
        '--symbol-ma-period', '50',
        '--no-dry-run',
      ].join(' '),
      instances: 1,
      cron_restart: '0 23 * * *',   // 매일 23:00 UTC = 08:00 KST
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'production' },
    },

    // ──────────────────────────────────────────────────────────
    // 5. Monitoring Bot — 시스템 상태 체크 + Telegram 알림
    //    10분 간격 실행 (TELEGRAM_BOT_TOKEN 설정 필요)
    // ──────────────────────────────────────────────────────────
    {
      name: 'monitoring-bot',
      script: 'dist/index.js',
      cwd: './services/monitoring-bot',
      instances: 1,
      cron_restart: '*/10 * * * *',
      autorestart: false,
      watch: false,
      max_memory_restart: '100M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
