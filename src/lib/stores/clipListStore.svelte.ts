// ── 타입 임포트 ──────────────────────────────────────────────────
import type { Clip } from '$lib/api/clips';
import type { Video } from '$lib/api/videos';
import type { ActiveRecord } from '$lib/api/record';

// ── 유틸 ─────────────────────────────────────────────────────────
import { localUrl } from '$lib/utils/url';

// ── 클립/영상/녹화 목록 및 모달 상태 스토어 ──────────────────────
// 앱 전역에서 공유되는 완료된 작업 목록과 미리보기 모달 상태를 관리
class ClipListStore {
	// ── 반응형 목록 상태 ────────────────────────────────────────────
	clips = $state<Clip[]>([]); // 완료된 클립 목록
	videos = $state<Video[]>([]); // 완료된 전체 영상 다운로드 목록
	records = $state<ActiveRecord[]>([]); // 완료된 녹화 목록

	// ── 생성 예정 미리보기 상태 ──────────────────────────────────────
	preview = $state<{
		files: { filename: string; timeLabel: string }[];
		title: string | null;
		streamer: string | null;
		thumbnail: string | null;
		busy: boolean;
		progress: number;
		progressLabel: string;
	} | null>(null);

	setPreview(
		data: {
			files: { filename: string; timeLabel: string }[];
			title: string | null;
			streamer: string | null;
			thumbnail: string | null;
			busy: boolean;
			progress: number;
			progressLabel: string;
		} | null
	) {
		this.preview = data;
	}

	// ── 모달 상태 ───────────────────────────────────────────────────
	modalUrl = $state(''); // 미리보기 모달에 표시할 영상 URL
	showModal = $state(false); // 모달 표시 여부

	// ── 모달 열기 ───────────────────────────────────────────────────
	// 로컬 URL로 변환 후 모달 표시
	openModal(fileUrl: string) {
		this.modalUrl = localUrl(fileUrl);
		this.showModal = true;
	}

	// ── 모달 닫기 ───────────────────────────────────────────────────
	closeModal() {
		this.showModal = false;
		this.modalUrl = '';
	}

	// ── 클립 삭제 ───────────────────────────────────────────────────
	// Blob URL이면 메모리 해제 후 목록에서 제거
	removeClip(id: string) {
		const clip = this.clips.find((c) => c.id === id);
		if (clip?.file_url?.startsWith('blob:')) URL.revokeObjectURL(clip.file_url);
		this.clips = this.clips.filter((c) => c.id !== id);
	}

	// ── 영상 삭제 ───────────────────────────────────────────────────
	removeVideo(id: string) {
		this.videos = this.videos.filter((v) => v.id !== id);
	}

	// ── 녹화 항목 삭제 ──────────────────────────────────────────────
	// Blob URL이면 메모리 해제 후 목록에서 제거
	removeRecord(filename: string) {
		const rec = this.records.find((r) => r.filename === filename);
		if (rec?.file_url?.startsWith('blob:')) URL.revokeObjectURL(rec.file_url);
		this.records = this.records.filter((r) => r.filename !== filename);
	}

	// ── 클립 추가 ───────────────────────────────────────────────────
	// 클립 생성 완료 시 목록 맨 앞에 삽입
	addClip(info: { title: string | null; startSec: number; endSec: number; blobUrl: string; filename: string }) {
		const clip: Clip = {
			id: crypto.randomUUID(),
			platform: 'browser',
			status: 'completed',
			title: info.title ?? undefined,
			start_time: info.startSec,
			end_time: info.endSec,
			file_url: info.blobUrl,
			download_name: info.filename
		};
		this.clips = [clip, ...this.clips];
	}

	// ── 영상 추가 ───────────────────────────────────────────────────
	// 전체 영상 다운로드 완료 시 목록 맨 앞에 삽입
	addVideo(info: { title: string | null; url: string; blobUrl: string; filename: string }) {
		const video: Video = {
			id: crypto.randomUUID(),
			url: info.url,
			status: 'completed',
			title: info.title ?? undefined,
			file_url: info.blobUrl,
			download_name: info.filename
		};
		this.videos = [video, ...this.videos];
	}

	// ── 녹화 항목 추가 ──────────────────────────────────────────────
	// 동일 파일명의 기존 항목을 제거하고 완료된 녹화를 맨 앞에 삽입
	addRecord(info: { filename: string; url: string; blobUrl: string }) {
		const record: ActiveRecord = {
			id: crypto.randomUUID(),
			filename: info.filename,
			url: info.url,
			status: 'completed',
			file_url: info.blobUrl,
			error_message: null,
			started_at: null
		};
		this.records = [record, ...this.records.filter((r) => r.filename !== info.filename)];
	}
}

export const clipListStore = new ClipListStore();
