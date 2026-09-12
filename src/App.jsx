import { Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth, RequireRole } from '@/auth/guards'
import { AppLayout } from '@/layouts/AppLayout'

import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MyFormsPage } from '@/pages/MyFormsPage'
import { FillFormPage } from '@/pages/FillFormPage'
import { MySubmissionsPage } from '@/pages/MySubmissionsPage'
import { FormSubmissionsPage } from '@/pages/FormSubmissionsPage'
import { SubmissionDetailPage } from '@/pages/SubmissionDetailPage'
import { FormsPage } from '@/pages/FormsPage'
import { NewFormPage } from '@/pages/NewFormPage'
import { FormDetailPage } from '@/pages/FormDetailPage'
import { ReviewPage } from '@/pages/ReviewPage'
import { ExportsPage } from '@/pages/ExportsPage'
import { UsersPage } from '@/pages/UsersPage'
import { AuditPage } from '@/pages/AuditPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const ADMIN_SUP = ['admin', 'supervisor']

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Authenticated shell */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/my-forms" element={<MyFormsPage />} />
        <Route path="/my-submissions" element={<MySubmissionsPage />} />
        <Route path="/my-submissions/:formId" element={<FormSubmissionsPage />} />
        <Route path="/f/:slug" element={<FillFormPage />} />
        <Route path="/submissions/:id" element={<SubmissionDetailPage />} />

        {/* Admin + supervisor */}
        <Route
          path="/forms"
          element={
            <RequireRole roles={ADMIN_SUP}>
              <FormsPage />
            </RequireRole>
          }
        />
        <Route
          path="/forms/new"
          element={
            <RequireRole roles={ADMIN_SUP}>
              <NewFormPage />
            </RequireRole>
          }
        />
        <Route
          path="/forms/:id"
          element={
            <RequireRole roles={ADMIN_SUP}>
              <FormDetailPage />
            </RequireRole>
          }
        />
        <Route
          path="/review"
          element={
            <RequireRole roles={ADMIN_SUP}>
              <ReviewPage />
            </RequireRole>
          }
        />
        <Route
          path="/exports"
          element={
            <RequireRole roles={ADMIN_SUP}>
              <ExportsPage />
            </RequireRole>
          }
        />

        {/* Admin only */}
        <Route
          path="/users"
          element={
            <RequireRole roles={['admin']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireRole roles={['admin']}>
              <AuditPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
