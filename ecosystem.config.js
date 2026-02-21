/**
 * PM2 Ecosystem - Trading System
 *
 * 멀티마켓 자동매매 운영 구성 (CRYPTO + KRX, KIS 모의투자)
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
      time: true,
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
      time: true,
      env: {
        NODE_ENV: 'production',
        KIS_ENV: 'PAPER',
      },
    },

    // ──────────────────────────────────────────────────────────
    // 3. KIS Collector — KRX 시세/예수금 수집 (장중 루프)
    //    KIS_ENV=PAPER 강제
    // ──────────────────────────────────────────────────────────
    {
      name: 'kis-collector',
      script: 'dist/index.js',
      cwd: './services/kis-collector',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
      time: true,
      env: {
        NODE_ENV: 'production',
        KIS_ENV: 'PAPER',
      },
    },

    // ──────────────────────────────────────────────────────────
    // 4. Market Calendar — 실적/이벤트 수집 (서비스 내부 24h 주기)
    // ──────────────────────────────────────────────────────────
    {
      name: 'market-calendar',
      script: 'dist/index.js',
      cwd: './services/market-calendar',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '150M',
      time: true,
      env: { NODE_ENV: 'production' },
    },

    // ──────────────────────────────────────────────────────────
    // 5. AI Analyzer — 1회성 잡 (30분 주기 재실행)
    //    상시 데몬이 아니라 cron_restart + autorestart=false 사용
    // ──────────────────────────────────────────────────────────
    {
      name: 'ai-analyzer',
      script: 'dist/index.js',
      cwd: './services/ai-analyzer',
      instances: 1,
      cron_restart: '*/30 * * * *',
      autorestart: false,
      watch: false,
      max_memory_restart: '300M',
      time: true,
      env: { NODE_ENV: 'production' },
    },

    // ──────────────────────────────────────────────────────────
    // 6. Trade Executor — 신호 감지 → 주문 실행 (24시간 루프)
    //    실행 설정은 루트 .env + services/trade-executor/.env(override) 사용
    //    예: LOOP_MODE=true, DRY_RUN=false, EXECUTE_MARKETS=CRYPTO,KRX
    //    KIS_ENV=PAPER 강제
    // ──────────────────────────────────────────────────────────
    {
      name: 'trade-executor',
      script: 'dist/index.js',
      cwd: './services/trade-executor',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      time: true,
      env: {
        NODE_ENV: 'production',
        KIS_ENV: 'PAPER',
      },
    },

    // ──────────────────────────────────────────────────────────
    // 7. Portfolio Signal — 신호 생성 (30분 주기, UTC 기준)
    //    --no-dry-run: trading_signals DB INSERT 활성화
    // ──────────────────────────────────────────────────────────
    {
      name: 'portfolio-signal',
      script: 'dist/cli.js',
      cwd: './services/backtest-engine',
      args: [
        'portfolio-signal',
        '--symbols',
        'KRW-BTC',
        '--crypto-strategy',
        'bb-squeeze',
        '--spy-filter',
        '--symbol-ma-filter',
        '--symbol-ma-period',
        '50',
        '--no-dry-run',
      ].join(' '),
      instances: 1,
      cron_restart: '*/30 * * * *', // 30분마다 실행 (UTC)
      autorestart: false,
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },

    // ──────────────────────────────────────────────────────────
    // 8. Monitoring Bot — 시스템 상태 체크 + Telegram 알림
    //    10분 간격 실행 (UTC 기준, TELEGRAM_BOT_TOKEN 설정 필요)
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
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },

    // ──────────────────────────────────────────────────────────
    // 9. Monitoring Daily Report — 하루 요약 전송 (일 1회)
    //    DAILY_REPORT_ENABLED=true 이어야 실제 전송
    //    매일 00:10 UTC (KST 09:10) 고정 실행
    // ──────────────────────────────────────────────────────────
    {
      name: 'monitoring-daily-report',
      script: 'dist/index.js',
      cwd: './services/monitoring-bot',
      args: '--daily-report',
      instances: 1,
      cron_restart: '10 0 * * *', // 매일 00:10 UTC (KST 09:10)
      autorestart: false,
      watch: false,
      max_memory_restart: '100M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
