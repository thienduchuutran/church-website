import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import EmptyState from '@/components/ui/EmptyState'

export const metadata: Metadata = {
  title: 'Resources - Our Church',
}

export default async function ResourcesPage() {
  const t = await getTranslations('Pages')
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <h1 className="t-title mb-10">{t('resourcesTitle')}</h1>
      <EmptyState title={t('resourcesEmpty')} hint={t('resourcesEmptyHint')} />
    </div>
  )
}
