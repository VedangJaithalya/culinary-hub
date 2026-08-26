import FeedContainer from './components/FeedContainer'
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
 */
function App() {
  return (
    <div className="bg-neutral-950 min-h-screen flex justify-center items-center">
      <FeedContainer />
    </div>
  )
}

export default App
