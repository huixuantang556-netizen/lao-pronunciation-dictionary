(() => {
  const panel = document.createElement('details');
  panel.className = 'dictionary-settings';
  panel.innerHTML = `<summary>离线与安装 · 试用版</summary>
    <p>不登录也可以使用本机词典。程序与学习资料分别保存；新设备不会自动出现旧设备的录音。</p>
    <p data-offline-status role="status">正在检查离线安装条件…</p>
    <p data-app-version style="font-size:12px;overflow-wrap:anywhere"></p>
    <button type="button" data-check-update>检查更新</button>
    <button type="button" data-apply-update hidden>保存进度并更新</button>
    <button type="button" data-install hidden>安装到桌面</button>
    <button type="button" data-persist>申请保留本机资料</button>
    <p data-storage role="status"></p>
    <p>iPhone：在 Safari 中打开 HTTPS 安装地址，选择分享 → 添加到主屏幕。其他设备可使用浏览器的安装应用功能。</p>
    <p>本试用包仅包含程序；公共单词卡和语音包尚未接入。参考发音保留在原始备份中，没有删除。请勿清除原浏览器数据。</p>
    <p>离线可播放已保存音频；首次生成 AI 发音、登录与同步仍需联网。保持定期备份，卸载或清除网站数据可能删除本机资料。</p>`;
  if(typeof window.appMoveOfflinePanel==='function')window.appMoveOfflinePanel(panel);else document.querySelector('#localDataNotice').after(panel);
  const status = panel.querySelector('[data-offline-status]');
  const storage = panel.querySelector('[data-storage]');
  const versionText=panel.querySelector('[data-app-version]');
  const pageVersion=document.querySelector('meta[name="lao-app-build"]')?.content||'';
  versionText.textContent='当前页面版本：'+(pageVersion||'未知（旧包）');
  const install = panel.querySelector('[data-install]');
  const apply=panel.querySelector('[data-apply-update]'),check=panel.querySelector('[data-check-update]');
  let applying=false,hadController=!!navigator.serviceWorker?.controller;
  const banner=document.createElement('div');banner.hidden=true;banner.setAttribute('role','status');banner.style.cssText='position:fixed;top:8px;left:12px;right:12px;z-index:9999;background:#eef7f1;color:#183e36;border:1px solid #b9d7cb;border-radius:12px;padding:12px;box-shadow:0 4px 24px #143f3220;font-size:14px';
  banner.innerHTML='<span>新版已就绪，当前页面仍运行旧版。</span> <button type="button">保存进度并更新</button>';document.body.append(banner);banner.querySelector('button').onclick=()=>apply.click();
  const offerUpdate=message=>{status.textContent=message;apply.hidden=false;banner.hidden=false;};
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{
    if(applying)location.reload();
    else if(!hadController)hadController=true;
    else offerUpdate('程序控制器已更新，但当前页面内容尚未刷新。保存后点击更新，无需关闭其他页面。');
  });
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='APP_VERSION_ACTIVATED'&&event.data.version!==pageVersion&&!applying)offerUpdate('其他窗口已启用新版；当前页仍是旧版，请保存后更新。');});
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
      const registration = await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const workerVersion=worker=>new Promise(resolve=>{if(!worker){resolve('');return;}const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve('');},1500);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(typeof e.data?.version==='string'?e.data.version:'');};try{worker.postMessage({type:'GET_APP_VERSION'},[channel.port2]);}catch(_){clearTimeout(timer);channel.port1.close();resolve('');}});
      const ready=()=>{if(registration.waiting)offerUpdate('新版已下载，等待启用。点击“保存进度并更新”，无需关闭其他页面。');};
      const installed=worker=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(Error('新版仍在下载或网络较慢，尚不能确认完成，请稍后重试'));},30000);function changed(){if(['installed','activated','redundant'].includes(worker.state)){clearTimeout(timer);worker.removeEventListener('statechange',changed);worker.state==='redundant'?reject(Error('新版安装失败，可能文件尚未全部上传；旧版仍可使用')):resolve();}}worker.addEventListener('statechange',changed);changed();});
      let checking=false;
      const verify=async()=>{if(checking||applying)return;checking=true;check.disabled=true;let timer;
        try{
          status.textContent='正在联网核对发布版本…';const abort=new AbortController();timer=setTimeout(()=>abort.abort(),12000);
          const response=await fetch(new URL('version.json?check='+Date.now(),registration.scope),{cache:'no-store',signal:abort.signal});clearTimeout(timer);
          if(!response.ok)throw Error('线上缺少版本清单（HTTP '+response.status+'），请完整上传新版文件');const latest=(await response.json()).version;if(!/^[0-9a-f]{16}$/.test(latest||''))throw Error('线上版本清单无效');
          status.textContent='线上版本 '+latest+'，正在检查并下载程序…';await registration.update();if(registration.installing)await installed(registration.installing);
          const active=await workerVersion(registration.active);versionText.textContent='当前页面：'+(pageVersion||'未知')+' · 已启用：'+(active||'旧版／无法识别')+' · 线上：'+latest;
          if(registration.waiting){const waiting=await workerVersion(registration.waiting);offerUpdate(waiting===latest?'线上新版已下载，当前页尚未更新。保存后即可启用。':'存在等待启用的版本，但还未确认与线上一致；可更新后再次检查。');}
          else if(pageVersion===latest&&active===latest){status.textContent='已核实：当前页面与线上版本一致。';apply.hidden=true;banner.hidden=true;}
          else if(active===latest)offerUpdate('新版已经启用，但当前页面仍是旧内容。保存后刷新即可，不需关闭其他窗口。');
          else {status.textContent='尚未确认更新成功。可能正在发布或下载未完成，请稍后再检查；不能认定当前为最新版。';if(pageVersion!==latest)offerUpdate(status.textContent);}
        }catch(e){status.textContent='未能确认最新版本：'+(e.name==='AbortError'?'网络检查超时，请联网重试':e.message);ready();}
        finally{clearTimeout(timer);checking=false;check.disabled=false;}
      };
      check.onclick=verify;
      apply.onclick=async()=>{
        if(applying)return;
        apply.disabled=true;
        try{
          if(typeof window.prepareLaoAppUpdate!=='function')throw Error('请先保存当前内容，再刷新页面。');
          await window.prepareLaoAppUpdate();applying=true;
          if(registration.waiting){registration.waiting.postMessage({type:'ACTIVATE_SAVED_UPDATE'});status.textContent='进度已保存，正在启用新版…';setTimeout(()=>{if(applying){applying=false;offerUpdate('启用尚未完成，请重试；未要求关闭其他窗口。');}},12000);}
          else location.reload();
        }catch(e){applying=false;status.textContent='尚未更新：'+e.message;}
        finally{apply.disabled=false;}
      };
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller)
            ready();
          if (worker.state === 'redundant') status.textContent = '离线安装未完成，请联网重新打开。';
        });
      });
      await navigator.serviceWorker.ready;
      status.textContent = '程序本体已保存，可断网重新打开。正在核对当前版本…';ready();void verify();
      document.addEventListener('visibilitychange',()=>{if(!document.hidden&&registration.waiting)ready();});
    } catch (e) { status.textContent = '离线安装失败，尚不能保证断网启动：' + e.message; }
  })();
})();
