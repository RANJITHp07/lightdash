import { ValidationResponse } from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    clsx,
    Flex,
    Group,
    Paper,
    Stack,
    Table,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconChartBar,
    IconCheck,
    IconLayoutDashboard,
    IconTable,
} from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import {
    useValidation,
    useValidationMutation,
} from '../../hooks/validation/useValidation';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceView/ResourceIcon';

const MIN_ROWS_TO_ENABLE_SCROLLING = 6;

const UpdatedAtAndBy: FC<
    Required<Pick<ValidationResponse, 'lastUpdatedAt' | 'lastUpdatedBy'>>
> = ({ lastUpdatedAt, lastUpdatedBy }) => {
    const timeAgo = useTimeAgo(lastUpdatedAt);

    return (
        <>
            <Text fw={500}>{timeAgo}</Text>
            <Text color="gray.6">by {lastUpdatedBy}</Text>
        </>
    );
};

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { classes } = useTableStyles();
    const theme = useMantineTheme();
    const [isValidating, setIsValidating] = useState(false);

    const { data, isSuccess } = useValidation(projectUuid);
    const { mutate: validateProject } = useValidationMutation(projectUuid, () =>
        setIsValidating(false),
    );

    const Icon = ({
        validationError,
    }: {
        validationError: ValidationResponse;
    }) => {
        if (validationError.chartUuid)
            return <IconBox icon={IconChartBar} color="blue.8" />;
        if (validationError.dashboardUuid)
            return <IconBox icon={IconLayoutDashboard} color="green.8" />;
        return <IconBox icon={IconTable} color="indigo.6" />;
    };

    return (
        <Stack>
            <Text color="gray.6">
                Use the project validator to check what content is broken in
                your project.
            </Text>
            {isSuccess && (
                <Paper withBorder>
                    <Group
                        position="apart"
                        p="md"
                        sx={{
                            borderBottomWidth: 1,
                            borderBottomStyle: 'solid',
                            borderBottomColor: theme.colors.gray[3],
                        }}
                    >
                        <Text fw={500} fz="xs" c="gray.6">
                            {!!data?.length
                                ? `Last validated at: ${data[0].createdAt}`
                                : null}
                        </Text>
                        <Button
                            onClick={() => {
                                setIsValidating(true);
                                validateProject();
                            }}
                            loading={isValidating}
                            disabled={isValidating}
                        >
                            Run validation
                        </Button>
                    </Group>

                    <Box
                        sx={{
                            overflowY:
                                data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                    ? 'scroll'
                                    : 'auto',
                            maxHeight:
                                data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                    ? '500px'
                                    : 'auto',
                        }}
                    >
                        <Table
                            className={clsx(
                                classes.root,
                                classes.smallHeaderText,
                                classes.smallPadding,
                                classes.stickyHeader,
                            )}
                            fontSize="xs"
                            highlightOnHover
                        >
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Error</th>
                                    <th>Last edited</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data && data.length
                                    ? data.map((validationError) => (
                                          <tr key={validationError.name}>
                                              <td>
                                                  <Flex gap="sm" align="center">
                                                      <Icon
                                                          validationError={
                                                              validationError
                                                          }
                                                      />

                                                      <Text fw={600}>
                                                          {validationError.name}
                                                      </Text>
                                                  </Flex>
                                              </td>
                                              <td>
                                                  <Alert
                                                      icon={
                                                          <MantineIcon
                                                              icon={
                                                                  IconAlertCircle
                                                              }
                                                          />
                                                      }
                                                      pos="unset"
                                                      color="red"
                                                      fw={500}
                                                  >
                                                      <Text
                                                          fz="xs"
                                                          sx={{
                                                              wordBreak:
                                                                  'break-all',
                                                          }}
                                                      >
                                                          {
                                                              validationError.error
                                                          }
                                                      </Text>
                                                  </Alert>
                                              </td>
                                              <td>
                                                  {validationError.lastUpdatedAt &&
                                                  validationError.lastUpdatedBy ? (
                                                      <UpdatedAtAndBy
                                                          lastUpdatedAt={
                                                              validationError.lastUpdatedAt
                                                          }
                                                          lastUpdatedBy={
                                                              validationError.lastUpdatedBy
                                                          }
                                                      />
                                                  ) : (
                                                      <Text fw={500}>N/A</Text>
                                                  )}
                                              </td>
                                          </tr>
                                      ))
                                    : null}
                            </tbody>
                        </Table>
                        {!data?.length && (
                            <Group position="center" spacing="xs" p="md">
                                <MantineIcon icon={IconCheck} color="green" />
                                <Text fw={500} c="gray.7">
                                    No validation errors found
                                </Text>
                            </Group>
                        )}
                    </Box>
                </Paper>
            )}
        </Stack>
    );
};
