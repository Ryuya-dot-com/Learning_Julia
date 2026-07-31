// 選択肢の並び順を、シード文字列から安定シャッフルする
// (正解の位置がいつも同じにならないように)。
// SALT は実データ22問の正解表示位置が均等(8/7/7)になるよう決定的に選んだ値。
// 変えると全問題の並びが変わるので、問題の追加時に分布が崩れたときだけ再選定する
const SALT = "v56:";
function seededOrder(n, seedStr) {
  const seeded = SALT + seedStr;
  let s = 2166136261 >>> 0;
  for (let i = 0; i < seeded.length; i++) {
    s = (s ^ seeded.charCodeAt(i)) >>> 0;
    s = Math.imul(s, 16777619) >>> 0;
  }
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
  const idxs = [];
  for (let i = 0; i < n; i++) idxs.push(i);
  for (let k = n - 1; k > 0; k--) {
    const r = next() % (k + 1);
    const tmp = idxs[k];
    idxs[k] = idxs[r];
    idxs[r] = tmp;
  }
  return idxs;
}

/* ---------------- 小さな部品 ---------------- */


export { seededOrder };
