import {Component, type ReactNode} from 'react';

// The optional visualization must not take down title search or comparisons
// when a cached page cannot retrieve its lazily loaded application chunk.
export default class MapBoundary extends Component<{children: ReactNode; feature?: string; reloadLabel?: string}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  render() {
    if (this.state.failed) return <div role="alert"><p>The {this.props.feature ?? 'occupation map'} could not load. Reload the page to retry. Occupation search remains available.</p><button className="secondary" onClick={() => location.reload()}>{this.props.reloadLabel ?? 'Reload map'}</button></div>;
    return this.props.children;
  }
}
