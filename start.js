/**
 * 启动器脚本
 * 清除 ELECTRON_RUN_AS_NODE 环境变量后再启动 Electron。
 * 某些环境（如部分终端/IDE）会设置该变量，导致 Electron 以纯 Node 模式运行，
 * require('electron') 返回路径字符串而非 API 对象，从而报 "Cannot read properties of undefined (reading 'whenReady')"。
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const electronPath = require('electron'); // 纯 Node 下返回 electron 可执行文件路径

// 把 npm start 之后的额外参数（如 --dev）透传给 electron
const args = ['.', ...process.argv.slice(2)];

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => process.exit(code ?? 0));
