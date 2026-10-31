"""Minimal QR code generator: byte mode, error correction M, versions 1-10 (up to 213 bytes).
Pure standard library. make_qr(text) -> list of strings of '0'/'1' (1 = dark module)."""

_M = {
    1: (26, 10, [(1, 16)]), 2: (44, 16, [(1, 28)]), 3: (70, 26, [(1, 44)]),
    4: (100, 18, [(2, 32)]), 5: (134, 24, [(2, 43)]), 6: (172, 16, [(4, 27)]),
    7: (196, 18, [(4, 31)]), 8: (242, 22, [(2, 38), (2, 39)]),
    9: (292, 22, [(3, 36), (2, 37)]), 10: (346, 26, [(4, 43), (1, 44)]),
}
_ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
          7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}

_EXP, _LOG = [0] * 512, [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i], _LOG[_x] = _x, _i
    _x <<= 1
    if _x & 256:
        _x ^= 0x11D
for _i in range(255, 512):
    _EXP[_i] = _EXP[_i - 255]


def _gmul(a, b):
    return 0 if a == 0 or b == 0 else _EXP[_LOG[a] + _LOG[b]]


def _rs_remainder(data, n):
    gen = [1]
    for i in range(n):
        nxt = [0] * (len(gen) + 1)
        for j, c in enumerate(gen):
            nxt[j] ^= c
            nxt[j + 1] ^= _gmul(c, _EXP[i])
        gen = nxt
    rem = list(data) + [0] * n
    for i in range(len(data)):
        coef = rem[i]
        if coef:
            for j in range(1, len(gen)):
                rem[i + j] ^= _gmul(gen[j], coef)
    return rem[len(data):]


def _codewords(payload, version):
    total, ecc, groups = _M[version]
    capacity = sum(b * d for b, d in groups)
    bits = "0100" + format(len(payload), "08b" if version < 10 else "016b")
    bits += "".join(format(b, "08b") for b in payload)
    bits += "0" * min(4, capacity * 8 - len(bits))
    bits += "0" * (-len(bits) % 8)
    data = [int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)]
    pad = (0xEC, 0x11)
    while len(data) < capacity:
        data.append(pad[(len(data) - len(bits) // 8) % 2])
    blocks, pos = [], 0
    for count, size in groups:
        for _ in range(count):
            blocks.append(data[pos:pos + size])
            pos += size
    ecs = [_rs_remainder(b, ecc) for b in blocks]
    out = []
    for i in range(max(len(b) for b in blocks)):
        out += [b[i] for b in blocks if i < len(b)]
    for i in range(ecc):
        out += [e[i] for e in ecs]
    return out


def _bch(value, poly, bits_poly):
    shifted = value << (bits_poly.bit_length() - 1)
    while shifted.bit_length() >= bits_poly.bit_length():
        shifted ^= bits_poly << (shifted.bit_length() - bits_poly.bit_length())
    return shifted


def _base_matrix(version):
    n = 17 + 4 * version
    m = [[None] * n for _ in range(n)]

    def put(r, c, v):
        if 0 <= r < n and 0 <= c < n:
            m[r][c] = v

    for r0, c0 in ((0, 0), (0, n - 7), (n - 7, 0)):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                inside = 0 <= dr <= 6 and 0 <= dc <= 6
                dark = inside and (dr in (0, 6) or dc in (0, 6) or (2 <= dr <= 4 and 2 <= dc <= 4))
                put(r0 + dr, c0 + dc, dark)
    for i in range(8, n - 8):
        m[6][i] = m[i][6] = (i % 2 == 0)
    pos = _ALIGN[version]
    for r in pos:
        for c in pos:
            if (r, c) in ((6, 6), (6, pos[-1]), (pos[-1], 6)):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    m[r + dr][c + dc] = max(abs(dr), abs(dc)) != 1
    for i in range(9):
        pairs = [(i, 8), (8, i)] + ([(8, n - 1 - i), (n - 1 - i, 8)] if i < 8 else [])
        for r, c in pairs:
            if m[r][c] is None:
                m[r][c] = False
    if version >= 7:
        bits = (version << 12) | _bch(version, 0, 0x1F25)
        for i in range(18):
            v = bool((bits >> i) & 1)
            m[i // 3][i % 3 + n - 11] = v
            m[i % 3 + n - 11][i // 3] = v
    return m


_MASKS = [
    lambda i, j: (i + j) % 2 == 0, lambda i, j: i % 2 == 0, lambda i, j: j % 3 == 0,
    lambda i, j: (i + j) % 3 == 0, lambda i, j: (i // 2 + j // 3) % 2 == 0,
    lambda i, j: (i * j) % 2 + (i * j) % 3 == 0, lambda i, j: ((i * j) % 2 + (i * j) % 3) % 2 == 0,
    lambda i, j: ((i * j) % 3 + (i + j) % 2) % 2 == 0,
]


def _fill(base, codewords, mask):
    n = len(base)
    m = [row[:] for row in base]
    bits = [(cw >> k) & 1 for cw in codewords for k in range(7, -1, -1)]
    idx, row, step = 0, n - 1, -1
    col = n - 1
    while col > 0:
        if col == 6:
            col -= 1
        while True:
            for c in (col, col - 1):
                if base[row][c] is None:
                    dark = bool(bits[idx]) if idx < len(bits) else False
                    idx += 1
                    m[row][c] = dark != _MASKS[mask](row, c)
            row += step
            if row < 0 or row >= n:
                row -= step
                step = -step
                break
        col -= 2
    data = mask
    fmt = ((data << 10) | _bch(data, 0, 0x537)) ^ 0x5412
    for i in range(15):
        v = bool((fmt >> i) & 1)
        m[i if i < 6 else i + 1 if i < 8 else n - 15 + i][8] = v
        m[8][n - i - 1 if i < 8 else 15 - i if i < 9 else 14 - i] = v
    m[n - 8][8] = True
    return m


def _penalty(m):
    n, score = len(m), 0
    for grid in (m, [list(col) for col in zip(*m)]):
        for row in grid:
            run = 1
            for k in range(1, n):
                run = run + 1 if row[k] == row[k - 1] else 1
                if run == 5:
                    score += 3
                elif run > 5:
                    score += 1
            s = "".join("1" if v else "0" for v in row)
            score += 40 * (s.count("10111010000") + s.count("00001011101"))
    for r in range(n - 1):
        for c in range(n - 1):
            if m[r][c] == m[r][c + 1] == m[r + 1][c] == m[r + 1][c + 1]:
                score += 3
    dark = sum(v for row in m for v in row)
    return score + 10 * (abs(dark * 100 // (n * n) - 50) // 5)


def make_qr(text):
    payload = text.encode("utf-8")
    for version in sorted(_M):
        if len(payload) <= sum(b * d for b, d in _M[version][2]) - (2 if version < 10 else 3):
            break
    else:
        raise ValueError("Text is too long for the QR code.")
    words = _codewords(payload, version)
    base = _base_matrix(version)
    best = min((_fill(base, words, k) for k in range(8)), key=_penalty)
    return ["".join("1" if v else "0" for v in row) for row in best]

