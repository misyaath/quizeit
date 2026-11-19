import React from 'react'
import { routePath } from './routes.js'

export default function RouteLink({ to, navigate, ...props }) {
  const route = typeof to === 'string' ? { screen: to } : to
  return <a {...props} href={routePath(route)} onClick={event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(route)
  }} />
}

export function Breadcrumbs({ to, navigate, label, children }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li><RouteLink to={to} navigate={navigate}>{label}</RouteLink></li>
      <li><span aria-current="page">{children}</span></li>
    </ol>
  </nav>
}
