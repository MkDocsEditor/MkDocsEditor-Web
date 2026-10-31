import type { SectionModel } from '@/api'

/** A small wiki tree for tests. */
export function sampleTree(): SectionModel {
  return {
    type: 'section',
    id: 'root',
    name: 'docs',
    documents: [
      { type: 'document', id: 'd-index', name: 'index', filesize: 10, modtime: '', url: '' },
    ],
    resources: [{ type: 'resource', id: 'r-logo', name: 'logo.png', filesize: 2048, modtime: '' }],
    subsections: [
      {
        type: 'section',
        id: 's-rezepte',
        name: 'Rezepte',
        resources: [],
        subsections: [
          {
            type: 'section',
            id: 's-kuchen',
            name: 'Kuchen',
            subsections: [],
            resources: [],
            documents: [
              {
                type: 'document',
                id: 'd-apfel',
                name: 'Apfelkuchen',
                filesize: 100,
                modtime: '',
                url: 'Rezepte/Kuchen/Apfelkuchen/',
              },
            ],
          },
        ],
        documents: [
          {
            type: 'document',
            id: 'd-suppe',
            name: 'Kürbissuppe',
            filesize: 50,
            modtime: '',
            url: 'Rezepte/K%C3%BCrbissuppe/',
          },
        ],
      },
      {
        type: 'section',
        id: 's-urlaub',
        name: 'Urlaub',
        subsections: [],
        documents: [],
        resources: [],
      },
    ],
  }
}
