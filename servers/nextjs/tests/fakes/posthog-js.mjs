export const posthogMock = {
  inits: [],
  exceptions: [],
  optedOut: false,
  init(key, options) {
    this.inits.push({ key, options });
  },
  captureException(error, props) {
    if (this.optedOut) return;
    this.exceptions.push({ error, props });
  },
  opt_out_capturing() {
    this.optedOut = true;
  },
  opt_in_capturing() {
    this.optedOut = false;
  },
  reset() {
    this.inits = [];
    this.exceptions = [];
    this.optedOut = false;
  },
};

export default posthogMock;
