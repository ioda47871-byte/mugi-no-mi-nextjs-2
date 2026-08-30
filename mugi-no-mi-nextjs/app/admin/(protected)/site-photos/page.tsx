import { getAdminSitePhotos } from '@/lib/admin/site-photos';
import { SitePhotoUploadField } from '@/components/admin/SitePhotoUploadField';

export const dynamic = 'force-dynamic';

// このページから呼び出すfinalizeSitePhotoUploadAction(sharpによるダウンロード→
// 加工→再アップロード)は通常数秒で完了するが、Vercelのプランによって
// Server Actionsの実行時間上限が異なる(Hobby: 10秒, Pro: デフォルト60秒/
// 最大300秒)。どのプランでも安全に収まるよう保守的にHobby相当の10秒に
// 設定している。Proプラン確認済みで余裕を持たせたい場合は要相談。
export const maxDuration = 10;

export default async function AdminSitePhotosPage() {
  const photos = await getAdminSitePhotos();

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl text-ink">サイト写真</h1>
        <p className="mt-2 max-w-xl text-sm text-kura">
          Hero・外観・入口・店内・厨房・ショーケース・雑貨コーナー・ディスプレイの8枚を管理します。
          画像未設定のスロットは、既存のフォールバック表示のままサイトに反映されます。
          差し替えは公開サイトに数十秒程度で反映されます(再デプロイ不要)。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          <SitePhotoUploadField
            key={photo.slot}
            slot={photo.slot}
            label={photo.label}
            initialImageUrl={photo.imageUrl}
            initialAltText={photo.altText}
            initialUpdatedAt={photo.updatedAt}
          />
        ))}
      </div>
    </div>
  );
}
