import { registerRootComponent } from 'expo';

// Registers the background location TaskManager task at startup, before the OS
// can invoke it on a cold start. Must be imported before the app renders.
import './src/services/locationTracking';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
