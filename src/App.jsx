import FeedContainer from './components/FeedContainer'
import mockRecipes from './data/mockRecipes.json'
import './index.css'

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
