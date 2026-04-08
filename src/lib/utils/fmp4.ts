// fMP4 박스 파서: moof→traf→trun 샘플 duration 기반 실제 구간 길이 계산
// #EXTINF 명목 값 대신 PTS 기반 실제 duration을 사용해 긴 녹화의 누적 오차를 제거한다.

type Box = { type: string; start: number; end: number; dataOffset: number };

function readBoxAt(data: Uint8Array, offset: number): Box | null {
	if (offset + 8 > data.length) return null;
	const view = new DataView(data.buffer, data.byteOffset);
	const size = view.getUint32(offset);
	if (size < 8 || offset + size > data.length) return null;
	const type = String.fromCharCode(
		data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]
	);
	return { type, start: offset, end: offset + size, dataOffset: offset + 8 };
}

function findBox(data: Uint8Array, type: string, from = 0, to = data.length): Box | null {
	let offset = from;
	while (offset < to) {
		const box = readBoxAt(data, offset);
		if (!box) break;
		if (box.type === type) return box;
		offset = box.end;
	}
	return null;
}

// init 세그먼트(moov)의 moov/trak/mdia/mdhd 에서 timescale 추출
function getTimescale(initData: Uint8Array): number {
	const view = new DataView(initData.buffer, initData.byteOffset);
	const moov = findBox(initData, 'moov');
	if (!moov) return 90000;
	const trak = findBox(initData, 'trak', moov.dataOffset, moov.end);
	if (!trak) return 90000;
	const mdia = findBox(initData, 'mdia', trak.dataOffset, trak.end);
	if (!mdia) return 90000;
	const mdhd = findBox(initData, 'mdhd', mdia.dataOffset, mdia.end);
	if (!mdhd) return 90000;

	// mdhd fullbox: version(1) + flags(3) + creation_time + modification_time + timescale
	const version = initData[mdhd.dataOffset];
	// v0: times are uint32 (4 bytes each), v1: uint64 (8 bytes each)
	const timescaleOffset = mdhd.dataOffset + 4 + (version === 1 ? 16 : 8);
	return view.getUint32(timescaleOffset);
}

/**
 * fMP4 세그먼트의 실제 PTS 기반 duration(초)을 반환한다.
 * moof/traf/trun 의 per-sample duration을 합산하고 mdhd timescale로 나눈다.
 * initData가 없거나 파싱 실패 시 fallbackSec(#EXTINF 값)을 반환한다.
 */
export function getFmp4Duration(
	initData: Uint8Array | null,
	segData: Uint8Array,
	fallbackSec: number
): number {
	if (!initData) return fallbackSec;

	const timescale = getTimescale(initData);
	if (timescale === 0) return fallbackSec;

	const view = new DataView(segData.buffer, segData.byteOffset);
	let totalTicks = 0;
	let offset = 0;

	while (offset < segData.length) {
		const moof = findBox(segData, 'moof', offset);
		if (!moof) break;

		const traf = findBox(segData, 'traf', moof.dataOffset, moof.end);
		if (!traf) { offset = moof.end; continue; }

		// tfhd: default_sample_duration (flag bit 0x000008)
		let defaultDuration = 0;
		const tfhd = findBox(segData, 'tfhd', traf.dataOffset, traf.end);
		if (tfhd) {
			const tfhdFlags =
				(segData[tfhd.dataOffset + 1] << 16) |
				(segData[tfhd.dataOffset + 2] << 8) |
				segData[tfhd.dataOffset + 3];
			// version(1) + flags(3) + track_ID(4)
			let p = tfhd.dataOffset + 8;
			if (tfhdFlags & 0x000001) p += 8; // base_data_offset
			if (tfhdFlags & 0x000002) p += 4; // sample_description_index
			if (tfhdFlags & 0x000008) defaultDuration = view.getUint32(p);
		}

		// trun: per-sample durations
		const trun = findBox(segData, 'trun', traf.dataOffset, traf.end);
		if (trun) {
			const trunFlags =
				(segData[trun.dataOffset + 1] << 16) |
				(segData[trun.dataOffset + 2] << 8) |
				segData[trun.dataOffset + 3];
			const sampleCount = view.getUint32(trun.dataOffset + 4);
			// version(1) + flags(3) + sample_count(4)
			let p = trun.dataOffset + 8;
			if (trunFlags & 0x000001) p += 4; // data_offset
			if (trunFlags & 0x000004) p += 4; // first_sample_flags

			const hasDur  = !!(trunFlags & 0x000100);
			const hasSize = !!(trunFlags & 0x000200);
			const hasFlgs = !!(trunFlags & 0x000400);
			const hasCto  = !!(trunFlags & 0x000800);

			for (let i = 0; i < sampleCount; i++) {
				totalTicks += hasDur ? view.getUint32(p) : defaultDuration;
				if (hasDur)  p += 4;
				if (hasSize) p += 4;
				if (hasFlgs) p += 4;
				if (hasCto)  p += 4;
			}
		}

		offset = moof.end;
	}

	return totalTicks > 0 ? totalTicks / timescale : fallbackSec;
}
