import { useState } from 'react'
import FeedContainer from './components/FeedContainer'
import OnboardingModal from './components/OnboardingModal'
import { hasCompletedOnboarding } from './services/userProfileService.js'
import './index.css'
// Analytics: side-effect imports — execute once on load, attaching DevTools
// globals to the window for zero-import console access.
import './analytics/sessionTransformer.js'
// Phase 3 Pass 2: affinity model — attaches window.debugAffinity.
import './analytics/affinityModel.js'

/**
 * App — root render tree for CulinaryFeed.
 *
 * Provides a full-screen dark backdrop that centres the mobile-constrained
 * `FeedContainer`. On wider viewports this creates the "phone-in-browser"
 * device-agnostic layout used during development.
 *
 * Phase 4 Pass 1: FeedContainer is now self-contained — it manages its own
 * dynamic feed queue via `useFeedRanking`. No recipe props are required here.
 *
 * Cold-start onboarding: brand-new users (no persisted profile) see
 * `OnboardingModal` in place of the feed until they complete or skip it;
 * `hasCompletedOnboarding()` is checked once on mount via lazy useState
 * initialisation so the gate never flashes the feed first.
 */
function App() {
  const [onboarded, setOnboarded] = useState(() => hasCompletedOnboarding())

  return (
    <div className="bg-neutral-950 min-h-screen flex justify-center items-center">
      {onboarded ? (
        <FeedContainer />
      ) : (
        <OnboardingModal onComplete={() => setOnboarded(true)} />
      )}
    </div>
  )
}

export default App
