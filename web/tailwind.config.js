/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC',
          'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      boxShadow: {
        // 卡片：极轻，悬停加重
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.08)',
        pop: '0 8px 30px -6px rgb(15 23 42 / 0.16)',
      },
    },
  },
  plugins: [],
};
