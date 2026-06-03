import { Routes, Route, Navigate } from 'react-router-dom';
import appInfo from './app-info';
import { routes } from './app-routes';
import { SideNavOuterToolbar as SideNavBarLayout } from './layouts';
import { Footer } from './components';
import { usePermissions } from './hooks/use-permissions';

export default function Content() {
  const { firstAllowedPath } = usePermissions();

  return (
    <SideNavBarLayout title={appInfo.title}>
      <Routes>
        {routes.map(({ path, element }) => (
          <Route
            key={path}
            path={path}
            element={element}
          />
        ))}
        <Route
          path='*'
          element={<Navigate to={firstAllowedPath} replace />}
        />
      </Routes>
      <Footer>
        <div className="footer-attribution">
          System by Ali Osseili · Copyright Afrifood SARLU
        </div>
      </Footer>
    </SideNavBarLayout>
  );
}

