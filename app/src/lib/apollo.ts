import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { createClient } from 'graphql-ws'
import { getMainDefinition } from '@apollo/client/utilities'

let apolloClient: any = null

function createApolloClient(accessToken?: string) {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN
  const region = process.env.NEXT_PUBLIC_NHOST_REGION
  const graphqlUrl = `https://${subdomain}.hasura.${region}.nhost.run/v1/graphql`
  const wsUrl = `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`

  const headers: Record<string, string> = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const httpLink = new HttpLink({
    uri: graphqlUrl,
    headers,
  })

  const wsLink =
    typeof window !== 'undefined'
      ? new GraphQLWsLink(
          createClient({
            url: wsUrl,
            connectionParams: accessToken
              ? { headers: { Authorization: `Bearer ${accessToken}` } }
              : {},
          })
        )
      : null

  const splitLink =
    wsLink
      ? split(
          ({ query }) => {
            const def = getMainDefinition(query)
            return (
              def.kind === 'OperationDefinition' &&
              def.operation === 'subscription'
            )
          },
          wsLink,
          httpLink
        )
      : httpLink

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network' },
    },
  })
}

export function getApolloClient(accessToken?: string) {
  if (!apolloClient || accessToken) {
    apolloClient = createApolloClient(accessToken)
  }
  return apolloClient
}

export function resetApolloClient() {
  apolloClient = null
}
