/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── 纸感工作台 daylight ──
        paper: { DEFAULT: '#FAF7F2', deep: '#F4F1E9' }, // 页面底色 / 分组浅底
        card: '#FFFFFF',
        line: { DEFAULT: '#E8E1D5', soft: '#EFE9DE' }, // 卡片边框 / 行分隔
        ink: {
          DEFAULT: '#1D1D1F', // 标题与正文
          mid: '#5C5750', // 次级
          soft: '#8E877D', // 弱化（时间、备注）
          faint: '#B5AEA3', // 占位、分隔点
        },
        moss: { DEFAULT: '#2F6B4F', deep: '#245741', soft: '#EAF1EC' }, // 主色 墨绿
        clay: { DEFAULT: '#B4761A', soft: '#FBF0DC' }, // 重复 / 待审核 琥珀
        coral: { DEFAULT: '#C9503A', soft: '#FBEAE5' }, // 高优先 / 逾期
        lagoon: { DEFAULT: '#4A7CB8', soft: '#EAF0F7' }, // 进行中 蓝
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC',
          'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      maxWidth: {
        page: '1180px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(60 45 20 / 0.04)',
        'card-hover': '0 6px 18px -10px rgb(60 45 20 / 0.20)',
        pop: '0 16px 48px -16px rgb(60 45 20 / 0.24)',
      },
    },
  },
  plugins: [],
};
