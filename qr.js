// Gerador de códigos QR (modo byte, correção de erros nível M, versões 1 a 9).
// Feito à medida para os links do jogo, para não depender de bibliotecas externas.

const ECC_POR_BLOCO = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22];
const NUM_BLOCOS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5];

function modulosDeDados(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function capacidade(ver) {
  return Math.floor(modulosDeDados(ver) / 8) - ECC_POR_BLOCO[ver] * NUM_BLOCOS[ver];
}

function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(grau) {
  const r = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mul(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = mul(raiz, 2);
  }
  return r;
}

function resto(dados, div) {
  const r = div.map(() => 0);
  for (const b of dados) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= mul(c, f); });
  }
  return r;
}

function comCorrecao(dados, ver) {
  const nb = NUM_BLOCOS[ver];
  const ecc = ECC_POR_BLOCO[ver];
  const total = Math.floor(modulosDeDados(ver) / 8);
  const curtos = nb - (total % nb);
  const lenCurto = Math.floor(total / nb);
  const div = divisor(ecc);
  const blocos = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = dados.slice(k, k + lenCurto - ecc + (i < curtos ? 0 : 1));
    k += dat.length;
    const e = resto(dat, div);
    if (i < curtos) dat.push(0);
    blocos.push(dat.concat(e));
  }
  const out = [];
  for (let i = 0; i < blocos[0].length; i++) {
    blocos.forEach((b, j) => {
      if (i !== lenCurto - ecc || j >= curtos) out.push(b[i]);
    });
  }
  return out;
}

function posAlinhamento(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const passo = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = ver * 4 + 10; r.length < n; p -= passo) r.splice(1, 0, p);
  return r;
}

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalizacao(m) {
  const n = m.length;
  let p = 0;
  for (let y = 0; y < n; y++) {
    for (let eixo = 0; eixo < 2; eixo++) {
      let seguidos = 1;
      for (let x = 1; x < n; x++) {
        const a = eixo ? m[x][y] : m[y][x];
        const b = eixo ? m[x - 1][y] : m[y][x - 1];
        if (a === b) {
          seguidos++;
          if (seguidos === 5) p += 3;
          else if (seguidos > 5) p++;
        } else seguidos = 1;
      }
    }
  }
  let escuros = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) escuros++;
      if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
  }
  p += Math.floor(Math.abs(escuros * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

export function qrMatriz(texto) {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let ver = 1;
  while (ver <= 9 && bytes.length + 2 > capacidade(ver)) ver++;
  if (ver > 9) throw new Error("Texto demasiado longo para o código QR");
  const cap = capacidade(ver);

  const bits = [];
  const junta = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  junta(4, 4);
  junta(bytes.length, 8);
  bytes.forEach((b) => junta(b, 8));
  junta(0, Math.min(4, cap * 8 - bits.length));
  junta(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap * 8; pad ^= 0xec ^ 0x11) junta(pad, 8);
  const dados = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dados.push(b);
  }
  const codigo = comCorrecao(dados, ver);

  const n = ver * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixo = Array.from({ length: n }, () => new Array(n).fill(false));
  const poe = (x, y, v) => { m[y][x] = !!v; fixo[y][x] = true; };

  for (let i = 0; i < n; i++) { poe(6, i, i % 2 === 0); poe(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < n && y >= 0 && y < n) poe(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const al = posAlinhamento(ver);
  al.forEach((ax, i) => al.forEach((ay, j) => {
    const canto = (i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0);
    if (canto) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poe(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const poeFormato = (mascara) => {
    const d = mascara; // nível M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((d << 10) | r) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) poe(8, i, bit(i));
    poe(8, 7, bit(6)); poe(8, 8, bit(7)); poe(7, 8, bit(8));
    for (let i = 9; i < 15; i++) poe(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) poe(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) poe(8, n - 15 + i, bit(i));
    poe(8, n - 8, true);
  };
  poeFormato(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const v = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const b = ((v >>> i) & 1) !== 0;
      const a = n - 11 + (i % 3), c = Math.floor(i / 3);
      poe(a, c, b); poe(c, a, b);
    }
  }

  let k = 0;
  for (let direita = n - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = direita - j;
        const sobe = ((direita + 1) & 2) === 0;
        const y = sobe ? n - 1 - v : v;
        if (!fixo[y][x] && k < codigo.length * 8) {
          m[y][x] = ((codigo[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0;
          k++;
        }
      }
    }
  }

  const aplica = (mascara) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixo[y][x] && MASCARAS[mascara](x, y)) m[y][x] = !m[y][x];
  };
  let melhor = 0, min = Infinity;
  for (let i = 0; i < 8; i++) {
    aplica(i); poeFormato(i);
    const p = penalizacao(m);
    if (p < min) { min = p; melhor = i; }
    aplica(i);
  }
  aplica(melhor); poeFormato(melhor);
  return m;
}

export function qrSvg(texto) {
  const m = qrMatriz(texto);
  const n = m.length, q = 4;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  const t = n + q * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="Código QR para entrar no jogo"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
