import { usePrevious } from '@uidotdev/usehooks'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { useParams } from 'common/hooks/useParams'
import { SQLEditor } from 'components/interfaces/SQLEditor/SQLEditor'
import DefaultLayout from 'components/layouts/DefaultLayout'
import { EditorBaseLayout } from 'components/layouts/editors/EditorBaseLayout'
import { useEditorType } from 'components/layouts/editors/EditorsLayout.hooks'
import SQLEditorLayout from 'components/layouts/SQLEditorLayout/SQLEditorLayout'
import { SQLEditorMenu } from 'components/layouts/SQLEditorLayout/SQLEditorMenu'
import { useContentIdQuery } from 'data/content/content-id-query'
import { useDashboardHistory } from 'hooks/misc/useDashboardHistory'
import { useSelectedProjectQuery } from 'hooks/misc/useSelectedProject'
import { IS_PLATFORM } from 'lib/constants'
import { SnippetWithContent, useSnippets, useSqlEditorV2StateSnapshot } from 'state/sql-editor-v2'
import { createTabId, useTabsStateSnapshot } from 'state/tabs'
import type { NextPageWithLayout } from 'types'
import { Button } from 'ui'
import { Admonition } from 'ui-patterns'
import { generateSnippetTitle } from 'components/interfaces/SQLEditor/SQLEditor.constants'

const SqlEditor: NextPageWithLayout = () => {
  const router = useRouter()
  const { id, ref, content, skip } = useParams()
  const previousRoute = usePrevious(id)
  const { data: project } = useSelectedProjectQuery()

  const editor = useEditorType()
  const tabs = useTabsStateSnapshot()
  const snapV2 = useSqlEditorV2StateSnapshot()
  const { history, setLastVisitedSnippet } = useDashboardHistory()

  const allSnippets = useSnippets(ref!)
  const snippet = allSnippets.find((x) => x.id === id)

  const tabId = !!id ? tabs.openTabs.find((x) => x.endsWith(id)) : undefined

  console.log('[SqlEditor] params', { id, ref, content, skip })
  console.log('[SqlEditor] previousRoute', previousRoute)
  console.log('[SqlEditor] project', project)
  console.log('[SqlEditor] allSnippets', allSnippets)
  console.log('[SqlEditor] found snippet', snippet)
  console.log('[SqlEditor] tabId', tabId)

  const canFetchContentBasedOnId = Boolean(
    id !== 'new' && typeof snapV2.addSnippet === 'function' && !snippet?.isNotSavedInDatabaseYet
  )
  console.log('[SqlEditor] canFetchContentBasedOnId', canFetchContentBasedOnId)

  const { data, error, isError } = useContentIdQuery(
    { projectRef: ref, id },
    {
      retry: false,
      enabled: canFetchContentBasedOnId,
    }
  )

  console.log('[SqlEditor] useContentIdQuery result', { data, error, isError })

  const snippetMissing =
    isError && error?.code === 404 && error?.message?.includes('Content not found')
  const invalidId = isError && error?.code === 400 && error?.message?.includes('Invalid uuid')

  console.log('[SqlEditor] snippetMissing', snippetMissing)
  console.log('[SqlEditor] invalidId', invalidId)

  const snippetMissingImmediatelyAfterCreating =
    !!snippet && snippetMissing && previousRoute === 'new' && 'isNotSavedInDatabaseYet' in snippet

  console.log('[SqlEditor] snippetMissingImmediatelyAfterCreating', snippetMissingImmediatelyAfterCreating)

  useEffect(() => {
    console.log('[SqlEditor][useEffect:data]', { ref, data, project })
    if (ref && data && project) {
      console.log('[SqlEditor][useEffect:data] checking project match', {
        IS_PLATFORM,
        dataProjectId: data.project_id,
        projectId: project.id,
      })
      if (!IS_PLATFORM || data.project_id === project.id) {
        console.log('[SqlEditor][useEffect:data] setting snippet in snapV2')
        snapV2.setSnippet(ref, data as unknown as SnippetWithContent)
      } else {
        console.warn('[SqlEditor][useEffect:data] project mismatch, redirecting')
        setLastVisitedSnippet(undefined)
        router.push(`/project/${ref}/sql/new`)
      }
    }
  }, [ref, data, project])

  useEffect(() => {
    console.log('[SqlEditor][useEffect:new]', { id, skip, history, content })
    if (
      id === 'new' &&
      skip !== 'true' &&
      history.sql !== undefined &&
      content === undefined
    ) {
      const snippet = allSnippets.find((snippet) => snippet.id === history.sql)
      console.log('[SqlEditor][useEffect:new] found last visited snippet', snippet)
      if (snippet !== undefined) router.push(`/project/${ref}/sql/${history.sql}`)
    }
  }, [id, allSnippets, content])

  useEffect(() => {
    console.log('[SqlEditor][useEffect:route]', { isReady: router.isReady, id })
    if (!router.isReady || !id || id === 'new') return

    const tabId = createTabId('sql', { id })
    const snippet = allSnippets.find((x) => x.id === id)
    console.log('[SqlEditor][useEffect:route] adding tab', { tabId, snippet })

    tabs.addTab({
      id: tabId,
      type: 'sql',
      label: snippet?.name || generateSnippetTitle(),
      metadata: {
        sqlId: id,
        name: snippet?.name,
      },
    })
  }, [router.isReady, id])

  if ((snippetMissing || invalidId) && !snippetMissingImmediatelyAfterCreating) {
    console.warn('[SqlEditor] snippet missing or invalid id', { id, snippetMissing, invalidId })
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-[400px]">
          <Admonition
            type="default"
            title={`Unable to find snippet with ID ${id}`}
            description="This snippet doesn't exist in your project"
          >
            {!!tabId ? (
              <Button
                type="default"
                className="mt-2"
                onClick={() => {
                  console.log('[SqlEditor] closing tab', { tabId })
                  tabs.handleTabClose({
                    id: tabId,
                    router,
                    editor,
                    onClearDashboardHistory: () => setLastVisitedSnippet(undefined),
                  })
                }}
              >
                Close tab
              </Button>
            ) : (
              <Button
                asChild
                type="default"
                className="mt-2"
                onClick={() => {
                  console.log('[SqlEditor] heading back to project root')
                  setLastVisitedSnippet(undefined)
                }}
              >
                <Link href={`/project/${ref}/sql`}>Head back</Link>
              </Button>
            )}
          </Admonition>
        </div>
      </div>
    )
  }

  console.log('[SqlEditor] rendering SQLEditor')
  return <SQLEditor />
}

SqlEditor.getLayout = (page) => (
  <DefaultLayout>
    <EditorBaseLayout productMenu={<SQLEditorMenu />} product="SQL Editor">
      <SQLEditorLayout>{page}</SQLEditorLayout>
    </EditorBaseLayout>
  </DefaultLayout>
)

export default SqlEditor