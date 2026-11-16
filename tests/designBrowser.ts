import { fixtureUrl } from './browser'

/** Explicit HTML editor profile, built and served once by the shared browser rig. */
export function designFixtureUrl(): (file: string) => string {
  return (file) => fixtureUrl(file, 'design')
}
