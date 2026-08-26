import FeedContainer from './components/FeedContainer'
import mockRecipes from './data/mockRecipes.json'
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
 */
function App() {
  return (
    <div className="bg-neutral-950 min-h-screen flex justify-center items-center">
      <FeedContainer recipes={mockRecipes} />
    </div>
  )
}

export default App
