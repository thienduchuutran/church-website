'use client'

import { use } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuth } from '@/lib/auth'
import CreatePostForm from '@/components/features/admin/CreatePostForm'

export default function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = use(params)
  const { session, isAdmin, loading } = useAuth()
  const router = useRouter()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="font-sans text-muted">Loading...</p>
      </div>
    )
  }

  if (!session || !isAdmin) {
    router.push('/')
    return null
  }

  const label = section.replace('_', ' ')

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-8 font-serif text-3xl font-bold capitalize text-foreground">New {label}</h1>
      <CreatePostForm section={section} />
    </div>
  )
}
