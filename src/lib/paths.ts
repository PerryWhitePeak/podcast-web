const normalizedBase = (() => {
  const value = import.meta.env.BASE_URL || '/'
  return `/${value.replace(/^\/+|\/+$/g, '')}${value === '/' ? '' : '/'}`
})()

export const appBasePath = normalizedBase

export function appPath(path = '/'): string {
  const relative = path.replace(/^\/+/, '')
  return relative ? `${appBasePath}${relative}` : appBasePath
}

export function assetPath(path: string): string {
  return appPath(path)
}

export function currentRoute(pathname = window.location.pathname): string {
  const baseWithoutTrailingSlash = appBasePath === '/' ? '' : appBasePath.slice(0, -1)
  let route = pathname
  if (baseWithoutTrailingSlash && (route === baseWithoutTrailingSlash || route.startsWith(`${baseWithoutTrailingSlash}/`))) {
    route = route.slice(baseWithoutTrailingSlash.length)
  }
  if (!route.startsWith('/')) route = `/${route}`
  return route.length > 1 ? route.replace(/\/+$/, '') : route
}
