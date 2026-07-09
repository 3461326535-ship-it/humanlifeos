import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'art.humanlifeos.todo',
  appName: 'LifeOs',
  webDir: 'dist',
  server: {
    // 开发时用本地服务器，构建 APK 时注释掉 server.url
    // 这样 UI 从 APK 本地加载（离线可用），API 请求通过 config.ts 中的 API_BASE 指向远程服务器
    // url: 'https://humanlifeos.art',
    cleartext: true
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#488AFF',
    },
  },
};

export default config;
