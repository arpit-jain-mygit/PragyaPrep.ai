// Settings for the beta environment in AWS: the beta API. Used by `ng serve --configuration live` and production builds.
// This branch only: the dev and current live sites use their own API address.
export const environment = {
  name: 'live',
  apiBase: 'https://w7itr46gsxmgfr4tgsf56ovyse0mtqxd.lambda-url.ap-south-1.on.aws',
};
