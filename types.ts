
export interface BibleBook {
  id: number;
  name: string;
  chapters: number;
  category: 'OT' | 'NT';
}

// 각 장(index)마다 읽은 사람들의 ID 배열을 가집니다.
export type ReadStatus = Record<string, string[][]>;

export interface Bookmark {
  bookName: string;
  chapterIndex: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  color: string;
  dotColor: string;
  label: string;
  avatarUrl?: string; // 프로필 이미지 URL (Base64)
  startDate?: string; // 읽기 시작 날짜 (YYYY-MM-DD)
  endDate?: string;   // 읽기 완료 목표 날짜 (YYYY-MM-DD)
}

export interface Rival {
  id: string;
  name: string;
  status: Record<string, boolean[]>; // 라이벌은 기존 단순 구조 유지 또는 확장 가능
  percentage: number;
  lastUpdated: string;
}

export interface ProgressInfo {
  totalChapters: number;
  readChapters: number;
  percentage: number;
}
