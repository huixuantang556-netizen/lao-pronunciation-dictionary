(() => {
  const panel = document.createElement('details');
  panel.className = 'dictionary-settings';
  panel.innerHTML = `<summary>离线与安装 · 试用版</summary>
    <p>不登录也可以使用本机词典。程序与学习资料分别保存；新设备不会自动出现旧设备的录音。</p>
    <p data-offline-status role="status">正在检查离线安装条件…</p>
    <button type="button" data-install hidden>安装到桌面</button>
    <button type="button" data-persist>申请保留本机资料</button>
    <p data-storage role="status"></p>
    <p>iPhone：在 Safari 中打开 HTTPS 安装地址，选择分享 → 添加到主屏幕。其他设备可使用浏览器的安装应用功能。</p>
    <p>本试用包仅包含程序；公共单词卡和语音包尚未接入。参考发音保留在原始备份中，没有删除。请勿清除原浏览器数据。</p>
    <p>离线可播放已保存音频；首次生成 AI 发音、登录与同步仍需联网。保持定期备份，卸载或清除网站数据可能删除本机资料。</p>`;
  document.querySelector('#localDataNotice').after(panel);
  const status = panel.querySelector('[data-offline-status]');
  const storage = panel.querySelector('[data-storage]');
  const install = panel.querySelector('[data-install]');
  let prompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event; install.hidden = false;
  });
  install.onclick = async () => {
    if (!prompt) return;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch (e) { status.textContent = '未能打开安装提示：' + e.message; }
    prompt = null; install.hidden = true;
  };
  panel.querySelector('[data-persist]').onclick = async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      storage.textContent = granted ? '浏览器已允许持久保存；主动清除数据仍会删除资料，请继续备份。' : '此浏览器未授予持久保存，仍可使用本机存储。请定期备份。';
    } catch (e) { storage.textContent = '无法申请：' + e.message; }
  };
  if (location.protocol === 'file:') {
    status.textContent = '当前为本地文件试用：可打开程序，但无法在此安装离线应用。手机安装需将本包部署到 HTTPS 网站。';
    return;
  }
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent = '当前浏览器或地址不支持离线安装，请使用支持的浏览器及 HTTPS 地址。';
    return;
  }
  (async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller)
            status.textContent = '更新已下载。完成录音和保存后，关闭本应用全部窗口，再打开即可更新。';
          if (worker.state === 'redundant') status.textContent = '离线安装未完成，请联网重新打开。';
        });
      });
      await navigator.serviceWorker.ready;
      status.textContent = registration.waiting ? '更新已就绪；保存后关闭所有应用窗口，再打开即可更新。' : '程序本体已保存，可断网重新打开。单词卡和音频需要另行保存到本机。';
    } catch (e) { status.textContent = '离线安装失败，尚不能保证断网启动：' + e.message; }
  })();
})();
