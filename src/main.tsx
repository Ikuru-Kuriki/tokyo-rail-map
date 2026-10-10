import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initRegion } from './data';
import { regionFromHash } from './data/regions';
import './index.css';

// 地域（URL の #kansai など）のデータを読み込んでから、アプリを読み込む。
// アプリの各モジュールは読み込まれたときに今の地域のデータを使うため、App は後から import する
async function start() {
  await initRegion(regionFromHash(location.hash));
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// 地域を切り替えたら（ハッシュが変わったら）読み直す
window.addEventListener('hashchange', () => location.reload());

void start();
