/// <reference path="../@types/rudder-sdk-node.d.ts" />
import { Type } from '@aws-sdk/client-s3';
import {
    CartesianSeriesType,
    ChartKind,
    ChartType,
    DbtProjectType,
    getRequestMethod,
    LightdashInstallType,
    LightdashMode,
    LightdashRequestMethodHeader,
    LightdashUser,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    PinnedItem,
    ProjectMemberRole,
    QueryExecutionContext,
    RequestMethod,
    SchedulerFormat,
    SemanticLayerQuery,
    TableSelectionType,
    ValidateProjectPayload,
    WarehouseTypes,
    type SemanticLayerType,
} from '@lightdash/common';
import Analytics, {
    Track as AnalyticsTrack,
} from '@rudderstack/rudder-sdk-node';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { VERSION } from '../version';

type Identify = {
    userId: string;
    traits: {
        email?: string;
        first_name?: string;
        last_name?: string;
        is_tracking_anonymized: boolean;
        is_marketing_opted_in?: boolean;
    };
};
type BaseTrack = Omit<AnalyticsTrack, 'context'>;
type Group = {
    userId: string;
    groupId: string;
    traits: {
        name?: string;
    };
};
type TrackSimpleEvent = BaseTrack & {
    event:
        | 'password.updated'
        | 'invite_link.created'
        | 'invite_link.all_revoked'
        | 'password_reset_link.created'
        | 'password_reset_link.used'
        | 'personal_access_token.deleted'
        | 'personal_access_token.rotated';
};

type PersonalAccessTokenEvent = BaseTrack & {
    event: 'personal_access_token.created';
    properties: {
        userId: string;
        autoGenerated: boolean;
        method: RequestMethod;
    };
};

type DbtCloudIntegration = BaseTrack & {
    event: 'dbt_cloud_integration.updated' | 'dbt_cloud_integration.deleted';
    properties: {
        projectId: string;
    };
};

type LoginEvent = BaseTrack & {
    event: 'user.logged_in';
    properties: {
        loginProvider: 'password' | OpenIdIdentityIssuerType;
    };
};

type IdentityLinkedEvent = BaseTrack & {
    event: 'user.identity_linked' | 'user.identity_removed';
    properties: {
        loginProvider: OpenIdIdentityIssuerType;
    };
};

export type CreateUserEvent = BaseTrack & {
    event: 'user.created';
    userId?: string;
    properties: {
        context: string; // context on where/why this user was created
        createdUserId: string;
        organizationId: string | undefined; // undefined because they can join an org later
        userConnectionType: 'password' | OpenIdIdentityIssuerType;
    };
};

export type DeleteUserEvent = BaseTrack & {
    event: 'user.deleted';
    userId?: string;
    properties: {
        context: string; // context on where/why this user was delete
        firstName: string;
        lastName: string;
        email: string | undefined;
        organizationId: string | undefined;
        deletedUserId: string;
    };
};

export type UpdateUserEvent = BaseTrack & {
    event: 'user.updated';
    userId?: string;
    properties: Omit<LightdashUser, 'userUuid' | 'organizationUuid'> & {
        updatedUserId: string;
        organizationId: string | undefined;
        jobTitle?: string;
        context: string; // context on where/why this user was updated
    };
};

function isUserUpdatedEvent(event: BaseTrack): event is UpdateUserEvent {
    return event.event === 'user.updated';
}

type VerifiedUserEvent = BaseTrack & {
    event: 'user.verified';
    properties: {
        isTrackingAnonymized: boolean;
        email?: string;
        location: 'onboarding' | 'settings';
    };
};

function isUserVerifiedEvent(event: BaseTrack): event is VerifiedUserEvent {
    return event.event === 'user.verified';
}

type UserWarehouseCredentialsEvent = BaseTrack & {
    event:
        | 'user_warehouse_credentials.created'
        | 'user_warehouse_credentials.updated';
    properties: {
        credentialsId: string;
        warehouseType: WarehouseTypes;
    };
};

type UserWarehouseCredentialsDeleteEvent = BaseTrack & {
    event: 'user_warehouse_credentials.deleted';
    properties: {
        credentialsId: string;
    };
};

type UserJoinOrganizationEvent = BaseTrack & {
    event: 'user.joined_organization';
    properties: {
        organizationId: string;
        role: OrganizationMemberRole;
        projectIds: string[];
    };
};

export const getContextFromHeader = (req: Request) => {
    const method = getRequestMethod(req.header(LightdashRequestMethodHeader));
    switch (method) {
        case RequestMethod.CLI:
        case RequestMethod.CLI_CI:
            return QueryExecutionContext.CLI;
        case RequestMethod.UNKNOWN:
            return QueryExecutionContext.API;
        default:
            return undefined;
    }
};

export const getContextFromQueryOrHeader = (
    req: Request,
): QueryExecutionContext | undefined => {
    const context: QueryExecutionContext | undefined =
        typeof req.query.context === 'string'
            ? (req.query.context as QueryExecutionContext)
            : undefined;
    if (context) {
        for (const [key, value] of Object.entries(QueryExecutionContext)) {
            if (value.toLowerCase() === context.toLowerCase()) {
                return value as QueryExecutionContext;
            }
        }
        console.warn('Invalid query execution context', context);
    }
    return getContextFromHeader(req);
};

type MetricQueryExecutionProperties = {
    chartId?: string;
    metricsCount: number;
    dimensionsCount: number;
    tableCalculationsCount: number;
    tableCalculationsPercentFormatCount: number;
    tableCalculationsCurrencyFormatCount: number;
    tableCalculationsNumberFormatCount: number;
    filtersCount: number;
    sortsCount: number;
    hasExampleMetric: boolean;
    additionalMetricsCount: number;
    additionalMetricsFilterCount: number;
    additionalMetricsPercentFormatCount: number;
    additionalMetricsCurrencyFormatCount: number;
    additionalMetricsNumberFormatCount: number;
    numFixedWidthBinCustomDimensions: number;
    numFixedBinsBinCustomDimensions: number;
    numCustomRangeBinCustomDimensions: number;
    numCustomSqlDimensions: number;
    dateZoomGranularity: string | null;
    timezone?: string;
    virtualViewId?: string;
};

type SqlExecutionProperties = {
    sqlChartId?: string;
    usingStreaming: boolean;
};

type SemanticViewerExecutionProperties = {
    semanticViewerChartId?: string;
    usingStreaming: boolean;
    semanticLayer: SemanticLayerType;
};

type QueryExecutionEvent = BaseTrack & {
    event: 'query.executed';
    properties: {
        context: QueryExecutionContext;
        organizationId: string;
        projectId: string;
    } & (
        | MetricQueryExecutionProperties
        | SqlExecutionProperties
        | SemanticViewerExecutionProperties
    );
};

type CreateOrganizationEvent = BaseTrack & {
    event: 'organization.created';
    properties: {
        type: string;
        organizationId: string;
        organizationName: string;
    };
};

type UpdateOrganizationEvent = BaseTrack & {
    event: 'organization.updated';
    properties: {
        type: string;
        organizationId: string;
        organizationName: string;
        defaultProjectUuid: string | undefined;
        defaultColourPaletteUpdated: boolean;
        defaultProjectUuidUpdated: boolean;
    };
};

type DeleteOrganizationEvent = BaseTrack & {
    event: 'organization.deleted';
    properties: {
        type: string;
        organizationId: string;
        organizationName: string;
    };
};

type OrganizationAllowedEmailDomainUpdatedEvent = BaseTrack & {
    event: 'organization_allowed_email_domains.updated';
    properties: {
        organizationId: string;
        emailDomainsCount: number;
        role: OrganizationMemberRole;
        projectIds: string[];
        projectRoles: ProjectMemberRole[];
    };
};

type MetricFlowQueryEvent = BaseTrack & {
    event: 'metricflow_query.executed';
    properties: {
        organizationId: string;
        projectId: string;
    };
};

type ModeDashboardChartEvent = BaseTrack & {
    event: 'dashboard_chart.moved';
    properties: {
        projectId: string;
        savedQueryId: string;
        dashboardId: string;
        spaceId: string;
    };
};

type UpdateSavedChartEvent = BaseTrack & {
    event: 'saved_chart.updated';
    properties: {
        projectId: string;
        savedQueryId: string;
        dashboardId: string | undefined;
        virtualViewId: string | undefined;
    };
};
type DeleteSavedChartEvent = BaseTrack & {
    event: 'saved_chart.deleted';
    properties: {
        projectId: string;
        savedQueryId: string;
    };
};

type ChartHistoryEvent = BaseTrack & {
    event: 'saved_chart_history.view';
    properties: {
        projectId: string;
        savedQueryId: string;
        versionCount: number;
    };
};

type ViewChartVersionEvent = BaseTrack & {
    event: 'saved_chart_version.view';
    properties: {
        projectId: string;
        savedQueryId: string;
        versionId: string;
    };
};

type RollbackChartVersionEvent = BaseTrack & {
    event: 'saved_chart_version.rollback';
    properties: {
        projectId: string;
        savedQueryId: string;
        versionId: string;
    };
};

export type CreateSavedChartVersionEvent = BaseTrack & {
    event: 'saved_chart_version.created';
    properties: {
        title: string;
        description: string | undefined;
        projectId: string;
        savedQueryId: string;
        dimensionsCount: number;
        metricsCount: number;
        filtersCount: number;
        sortsCount: number;
        tableCalculationsCount: number;
        pivotCount: number;
        chartType: ChartType;
        cartesian?: {
            xAxisCount: number;
            yAxisCount: number;
            seriesCount: number;
            seriesTypes: CartesianSeriesType[];
            referenceLinesCount: number;
            margins: string;
            showLegend: boolean;
        };
        pie?: {
            isDonut: boolean;
        };
        table?: {
            conditionalFormattingRulesCount: number;
            hasMetricsAsRows: boolean;
            hasRowCalculation: boolean;
            hasColumnCalculations: boolean;
        };
        bigValue?: {
            hasBigValueComparison?: boolean;
        };
        numFixedWidthBinCustomDimensions: number;
        numFixedBinsBinCustomDimensions: number;
        numCustomRangeBinCustomDimensions: number;
        numCustomSqlDimensions: number;
    };
};

export type CreateSavedChartEvent = BaseTrack & {
    event: 'saved_chart.created';
    properties: CreateSavedChartVersionEvent['properties'] & {
        dashboardId: string | undefined;
        duplicated?: boolean;
        virtualViewId: string | undefined;
    };
};

export type DuplicatedChartCreatedEvent = BaseTrack & {
    event: 'duplicated_chart_created';
    properties: {
        projectId: string;
        newSavedQueryId: string;
        duplicateOfSavedQueryId: string;
        dimensionsCount: number;
        metricsCount: number;
        filtersCount: number;
        sortsCount: number;
        tableCalculationsCount: number;
        pivotCount: number;
        chartType: ChartType;
        cartesian?: {
            xAxisCount: number;
            yAxisCount: number;
            seriesCount: number;
            seriesTypes: CartesianSeriesType[];
        };
    };
};

export type ConditionalFormattingRuleSavedEvent = BaseTrack & {
    event: 'conditional_formatting_rule.saved';
    userId: string;
    properties: {
        projectId: string;
        organizationId: string;
        savedQueryId: string;
        type: 'single color' | 'color range';
        numConditions: number;
    };
};

type ProjectEvent = BaseTrack & {
    event: 'project.updated' | 'project.created';
    userId: string;
    properties: {
        projectName: string;
        projectId: string;
        projectType: DbtProjectType;
        warehouseConnectionType: WarehouseTypes;
        organizationId: string;
        dbtConnectionType: DbtProjectType;
        isPreview: boolean;
        method: RequestMethod;
        copiedFromProjectUuid?: string;
    };
};

type ProjectDeletedEvent = BaseTrack & {
    event: 'project.deleted';
    userId: string;
    properties: {
        projectId: string;
        isPreview: boolean;
    };
};

type ProjectTablesConfigurationEvent = BaseTrack & {
    event: 'project_tables_configuration.updated';
    userId: string;
    properties: {
        projectId: string;
        project_table_selection_type: TableSelectionType;
    };
};

type ProjectCompiledEvent = BaseTrack & {
    event: 'project.compiled';
    userId?: string;
    properties: {
        requestMethod: RequestMethod;
        projectId: string;
        projectName: string;
        projectType: DbtProjectType;
        warehouseType?: WarehouseTypes;
        modelsCount: number;
        modelsWithErrorsCount: number;
        modelsWithGroupLabelCount: number;
        metricsCount: number;
        packagesCount?: number;
        roundCount?: number;
        formattedFieldsCount?: number;
        urlsCount?: number;
        modelsWithSqlFiltersCount: number;
        columnAccessFiltersCount: number;
        additionalDimensionsCount: number;
    };
};

type ProjectErrorEvent = BaseTrack & {
    event: 'project.error';
    userId?: string;
    properties: {
        requestMethod: RequestMethod;
        projectId: string;
        name: string;
        statusCode: number;
        projectType: DbtProjectType;
        warehouseType?: WarehouseTypes;
    };
};

type DeletedDashboardEvent = BaseTrack & {
    event: 'dashboard.deleted';
    userId: string;
    properties: {
        projectId: string;
        dashboardId: string;
    };
};

type UpdatedDashboardEvent = BaseTrack & {
    event: 'dashboard.updated';
    userId: string;
    properties: {
        projectId: string;
        dashboardId: string;
        tilesCount: number;
        chartTilesCount: number;
        markdownTilesCount: number;
        loomTilesCount: number;
        filtersCount: number;
    };
};

export type CreateDashboardOrVersionEvent = BaseTrack & {
    event: 'dashboard.created' | 'dashboard_version.created';
    properties: {
        title: string;
        description: string | undefined;
        projectId: string;
        dashboardId: string;
        filtersCount: number;
        tilesCount: number;
        chartTilesCount: number;
        sqlChartTilesCount: number;
        markdownTilesCount: number;
        loomTilesCount: number;
        duplicated?: boolean;
    };
};

export type DuplicatedDashboardCreatedEvent = BaseTrack & {
    event: 'duplicated_dashboard_created';
    properties: {
        projectId: string;
        newDashboardId: string;
        duplicateOfDashboardId: string;
        filtersCount: number;
        tilesCount: number;
        chartTilesCount: number;
        markdownTilesCount: number;
        loomTilesCount: number;
    };
};

type ApiErrorEvent = BaseTrack & {
    event: 'api.error';
    userId?: string;
    anonymousId?: string;
    properties: {
        name: string;
        statusCode: number;
        route: string;
        method: string;
    };
};

type SpaceEvent = BaseTrack & {
    event: 'space.created' | 'space.updated';
    userId?: string;
    anonymousId?: string;
    properties: {
        name: string;
        spaceId: string;
        projectId: string;
        isPrivate: boolean;
        userAccessCount: number;
    };
};

type SpaceDeleted = BaseTrack & {
    event: 'space.deleted';
    userId?: string;
    anonymousId?: string;
    properties: {
        name: string;
        spaceId: string;
        projectId: string;
    };
};

type ProjectSearch = BaseTrack & {
    event: 'project.search';
    userId?: string;
    properties: {
        projectId: string;
        spacesResultsCount: number;
        dashboardsResultsCount: number;
        savedChartsResultsCount: number;
        sqlChartsResultsCount: number;
        tablesResultsCount: number;
        fieldsResultsCount: number;
    };
};
type DashboardUpdateMultiple = BaseTrack & {
    event: 'dashboard.updated_multiple';
    userId?: string;
    anonymousId?: string;
    properties: {
        dashboardIds: string[];
        projectId: string;
    };
};
type SavedChartUpdateMultiple = BaseTrack & {
    event: 'saved_chart.updated_multiple';
    userId?: string;
    anonymousId?: string;
    properties: {
        savedChartIds: string[];
        projectId: string;
    };
};

type PermissionsUpdated = BaseTrack & {
    event: 'permission.updated';
    userId?: string;
    anonymousId?: string;
    properties: {
        userId: string;
        userIdUpdated: string;
        organizationPermissions: OrganizationMemberRole;
        projectPermissions: any;
        newUser: boolean;
        generatedInvite: boolean;
    };
};

type FieldValueSearch = BaseTrack & {
    event: 'field_value.search';
    userId?: string;
    properties: {
        projectId: string;
        fieldId: string;
        searchCharCount: number;
        resultsCount: number;
        searchLimit: number;
    };
};

type ShareUrl = BaseTrack & {
    event: 'share_url.created' | 'share_url.used';
    userId: string;
    properties: {
        organizationId: string;
        path: string;
    };
};

type ShareSlack = BaseTrack & {
    event:
        | 'share_slack.unfurl'
        | 'share_slack.unfurl_completed'
        | 'share_slack.unfurl_error'
        | 'share_slack.install'
        | 'share_slack.install_error'
        | 'share_slack.delete';
    userId?: string;
    anonymousId?: string;
    properties: {
        pageType?: string;
        error?: string;
        organizationId?: string;
    };
};

type SavedChartView = BaseTrack & {
    event: 'saved_chart.view';
    userId: string;
    properties: {
        savedChartId: string;
        projectId: string;
        organizationId: string;
    };
};

type DashboardView = BaseTrack & {
    event: 'dashboard.view';
    userId: string;
    properties: {
        dashboardId: string;
        projectId: string;
        organizationId: string;
    };
};

type ViewSqlChart = BaseTrack & {
    event: 'sql_chart.view';
    userId: string;
    properties: {
        chartId: string;
        projectId: string;
        organizationId: string;
    };
};

type CreateSqlChartEvent = BaseTrack & {
    event: 'sql_chart.created';
    userId: string;
    properties: {
        chartId: string;
        projectId: string;
        organizationId: string;
    };
};

type UpdateSqlChartEvent = BaseTrack & {
    event: 'sql_chart.updated';
    userId: string;
    properties: {
        chartId: string;
        projectId: string;
        organizationId: string;
    };
};

type DeleteSqlChartEvent = BaseTrack & {
    event: 'sql_chart.deleted';
    userId: string;
    properties: {
        chartId: string;
        projectId: string;
        organizationId: string;
    };
};

export type CreateSqlChartVersionEvent = BaseTrack & {
    event: 'sql_chart_version.created';
    userId: string;
    properties: {
        chartId: string;
        versionId: string;
        projectId: string;
        organizationId: string;
        chartKind: ChartKind;
        barChart?: {
            groupByCount: number;
            yAxisCount: number;
            aggregationTypes: string[];
        };
        lineChart?: {
            groupByCount: number;
            yAxisCount: number;
            aggregationTypes: string[];
        };
        pieChart?: {
            groupByCount: number;
        };
    };
};

export type CreateSemanticViewerChartVersionEvent = BaseTrack & {
    event: 'semantic_viewer_chart_version.created';
    userId: string;
    properties: {
        chartId: string;
        versionId: string;
        projectId: string;
        organizationId: string;
        chartKind: ChartKind;
        semanticLayerQuery: SemanticLayerQuery;
        barChart?: {
            groupByCount: number;
            yAxisCount: number;
            aggregationTypes: string[];
        };
        lineChart?: {
            groupByCount: number;
            yAxisCount: number;
            aggregationTypes: string[];
        };
        pieChart?: {
            groupByCount: number;
        };
    };
};

type PromoteContent = BaseTrack & {
    event: 'promote.executed' | 'promote.error';
    userId: string;
    properties: {
        chartId?: string;
        dashboardId?: string;
        fromProjectId: string;
        toProjectId?: string;
        organizationId: string;
        slug?: string;
        withNewSpace?: boolean;
        hasExistingContent?: boolean;
        chartsCount?: number;
        error?: string;
    };
};

type AnalyticsDashboardView = BaseTrack & {
    event: 'usage_analytics.dashboard_viewed';
    userId: string;
    properties: {
        projectId: string;
        organizationId: string;
        dashboardType: 'user_activity';
    };
};

type SchedulerDashboardView = BaseTrack & {
    event: 'scheduled_deliveries.dashboard_viewed';
    userId: string;
    properties: {
        projectId: string;
        organizationId?: string;
        numScheduledDeliveries: number;
    };
};

type PinnedListUpdated = BaseTrack & {
    event: 'pinned_list.updated';
    userId: string;
    properties: {
        projectId: string;
        organizationId: string;
        location: 'homepage';
        pinnedListId: string;
        pinnedItems: PinnedItem[];
    };
};

export type SchedulerUpsertEvent = BaseTrack & {
    event: 'scheduler.created' | 'scheduler.updated';
    userId: string;
    properties: {
        projectId: string;
        organizationId: string;
        schedulerId: string;
        resourceType: 'dashboard' | 'chart';
        cronExpression: string;
        cronString: string;
        resourceId: string;
        format: SchedulerFormat;
        targets: Array<{
            schedulerTargetId: string;
            type: 'slack' | 'email';
        }>;
        timeZone: string | undefined;
        includeLinks: boolean;
    };
};
export type SchedulerTimezoneUpdateEvent = BaseTrack & {
    event: 'default_scheduler_time_zone.updated';
    userId: string;
    properties: {
        projectId: string;
        organizationId?: string;
        timeZone: string;
    };
};

export type SchedulerDashboardUpsertEvent = SchedulerUpsertEvent & {
    properties: SchedulerUpsertEvent['properties'] & {
        filtersUpdatedNum: number;
    };
};

export type SchedulerDeleteEvent = BaseTrack & {
    event: 'scheduler.deleted';
    userId: string;
    properties: {
        projectId: string;
        organizationId: string;
        schedulerId: string;
        resourceType: 'dashboard' | 'chart';
        resourceId: string;
    };
};

export type SchedulerJobEvent = BaseTrack & {
    event:
        | 'scheduler_job.created'
        | 'scheduler_job.deleted'
        | 'scheduler_job.started'
        | 'scheduler_job.completed'
        | 'scheduler_job.failed';
    anonymousId: string;
    properties: {
        jobId: string;
        schedulerId: string | undefined;
        sendNow?: boolean;
        isThresholdAlert?: boolean;
    };
};

export type SchedulerNotificationJobEvent = BaseTrack & {
    event:
        | 'scheduler_notification_job.created'
        | 'scheduler_notification_job.started'
        | 'scheduler_notification_job.completed'
        | 'scheduler_notification_job.failed';
    anonymousId: string;
    properties: {
        jobId: string;
        schedulerId?: string;
        resourceType?: 'dashboard' | 'chart';
        type: 'slack' | 'email' | 'gsheets';
        format?: SchedulerFormat;
        withPdf?: boolean;
        sendNow: boolean;
        isThresholdAlert?: boolean;
    };
};

export type CommentsEvent = BaseTrack & {
    event: 'comment.created' | 'comment.deleted' | 'comment.resolved';
    userId: string;
    properties: {
        dashboardTileUuid: string;
        dashboardUuid: string;
        isReply: boolean;
        hasMention: boolean;
        isOwner?: boolean;
    };
};

export const parseAnalyticsLimit = (
    limit: 'table' | 'all' | number | null | undefined,
) => {
    switch (limit) {
        case 'all':
        case null:
            return 'all';
        case 'table':
        case undefined:
            return 'results';
        default:
            return 'custom';
    }
};
export type DownloadCsv = BaseTrack & {
    event:
        | 'download_results.started'
        | 'download_results.completed'
        | 'download_results.error';
    userId: string;
    properties: {
        jobId: string;
        organizationId?: string;
        projectId: string;
        tableId?: string;
        fileType: SchedulerFormat.CSV | SchedulerFormat.GSHEETS;
        values?: 'raw' | 'formatted';
        limit?: 'results' | 'all' | 'custom';
        context?:
            | 'results'
            | 'chart'
            | QueryExecutionContext.ALERT
            | QueryExecutionContext.SCHEDULED_DELIVERY
            | 'sql runner'
            | 'dashboard csv zip';
        storage?: 'local' | 's3';
        numCharts?: number;
        numRows?: number;
        numColumns?: number;
        error?: string;
    };
};

export type Validation = BaseTrack & {
    event:
        | 'validation.page_viewed'
        | 'validation.run'
        | 'validation.completed'
        | 'validation.error';
    userId: string;
    properties: {
        organizationId?: string;
        projectId: string;
        validationRunId?: number;

        context?: ValidateProjectPayload['context'];
        numErrorsDetected?: number;
        numContentAffected?: number;
        error?: string;
    };
};

export type ValidationErrorDismissed = BaseTrack & {
    event: 'validation.error_dismissed';
    userId: string;
    properties: {
        organizationId?: string;
        projectId: string;
    };
};

export type UserAttributesPageEvent = BaseTrack & {
    event: 'user_attributes.page_viewed';
    userId: string;
    properties: {
        organizationId: string;
        userAttributesCount: number;
    };
};

export type UserAttributeCreateAndUpdateEvent = BaseTrack & {
    event: 'user_attribute.created' | 'user_attribute.updated';
    userId: string;
    properties: {
        organizationId: string;
        attributeId: string;
        name: string;
        description?: string;
        values: {
            userIds: string[];
            values: string[];
            groupIds: string[];
            groupValues: string[];
        };
        defaultValue: string | null;
    };
};

export type UserAttributeDeleteEvent = BaseTrack & {
    event: 'user_attribute.deleted';
    userId: string;
    properties: {
        organizationId: string;
        attributeId: string;
    };
};

export type GroupCreateAndUpdateEvent = BaseTrack & {
    event: 'group.created' | 'group.updated';
    userId?: string;
    properties: {
        context: string; // context on where/why this group was created/updated
        organizationId: string;
        groupId: string;
        name: string;
        countUsersInGroup: number;
        viaSso: boolean;
    };
};

export type GroupDeleteEvent = BaseTrack & {
    event: 'group.deleted';
    userId?: string;
    properties: {
        context: string; // context on where/why this group was deleted
        organizationId: string;
        groupId: string;
    };
};

export type SemanticLayerView = BaseTrack & {
    event: 'semantic_layer.get_views'; // started, completed, error suffix when using wrapEvent
    userId: string;
    properties: {
        organizationId: string;
        projectId: string;
        // on completed
        viewsCount?: number;
        // on error
        error?: string;
    };
};

export type VirtualViewEvent = BaseTrack & {
    event:
        | 'virtual_view.created'
        | 'virtual_view.updated'
        | 'virtual_view.deleted';
    userId: string;
    properties: {
        virtualViewId: string;
        projectId: string;
        organizationId: string;
        name?: string;
    };
};

export type GithubInstallEvent = BaseTrack & {
    event:
        | 'github_install.started'
        | 'github_install.completed'
        | 'github_install.error';
    userId: string;
    properties: {
        organizationId: string;
        byAdmin?: boolean;
        error?: string; // only for error
    };
};

export type WriteBackEvent = BaseTrack & {
    event: 'write_back.created';
    userId: string;
    properties: {
        name: string;
        organizationId: string;
        projectId: string;
        context: QueryExecutionContext;
    };
};

type CreateTagEvent = BaseTrack & {
    event: 'category.created';
    userId: string;
    properties: {
        name: string;
        projectId: string;
        organizationId: string;
    };
};

type TypedEvent =
    | TrackSimpleEvent
    | CreateUserEvent
    | UpdateUserEvent
    | DeleteUserEvent
    | VerifiedUserEvent
    | UserJoinOrganizationEvent
    | QueryExecutionEvent
    | ModeDashboardChartEvent
    | UpdateSavedChartEvent
    | DeleteSavedChartEvent
    | CreateSavedChartEvent
    | ChartHistoryEvent
    | ViewChartVersionEvent
    | RollbackChartVersionEvent
    | CreateSavedChartVersionEvent
    | ProjectErrorEvent
    | ApiErrorEvent
    | ProjectEvent
    | ProjectDeletedEvent
    | ProjectCompiledEvent
    | UpdatedDashboardEvent
    | DeletedDashboardEvent
    | CreateDashboardOrVersionEvent
    | ProjectTablesConfigurationEvent
    | CreateOrganizationEvent
    | UpdateOrganizationEvent
    | DeleteOrganizationEvent
    | OrganizationAllowedEmailDomainUpdatedEvent
    | UserWarehouseCredentialsEvent
    | UserWarehouseCredentialsDeleteEvent
    | LoginEvent
    | IdentityLinkedEvent
    | DbtCloudIntegration
    | PersonalAccessTokenEvent
    | DuplicatedChartCreatedEvent
    | DuplicatedDashboardCreatedEvent
    | ProjectSearch
    | SpaceEvent
    | SpaceDeleted
    | DashboardUpdateMultiple
    | SavedChartUpdateMultiple
    | FieldValueSearch
    | PermissionsUpdated
    | ShareUrl
    | ShareSlack
    | SavedChartView
    | DashboardView
    | PromoteContent
    | AnalyticsDashboardView
    | SchedulerUpsertEvent
    | SchedulerDeleteEvent
    | SchedulerJobEvent
    | SchedulerNotificationJobEvent
    | PinnedListUpdated
    | DownloadCsv
    | SchedulerDashboardView
    | Validation
    | ValidationErrorDismissed
    | UserAttributesPageEvent
    | UserAttributeCreateAndUpdateEvent
    | UserAttributeDeleteEvent
    | MetricFlowQueryEvent
    | GroupCreateAndUpdateEvent
    | GroupDeleteEvent
    | ConditionalFormattingRuleSavedEvent
    | ViewSqlChart
    | CreateSqlChartEvent
    | UpdateSqlChartEvent
    | DeleteSqlChartEvent
    | CreateSqlChartVersionEvent
    | CommentsEvent
    | VirtualViewEvent
    | GithubInstallEvent
    | WriteBackEvent
    | SchedulerTimezoneUpdateEvent
    | CreateTagEvent;

type WrapTypedEvent = SemanticLayerView;

type UntypedEvent<T extends BaseTrack> = Omit<BaseTrack, 'event'> &
    T & {
        event: Exclude<T['event'], TypedEvent['event']>;
    };

type LightdashAnalyticsArguments = {
    lightdashConfig: LightdashConfig;
    writeKey: string;
    dataPlaneUrl: string;
    options?: ConstructorParameters<typeof Analytics>[2];
};

export class LightdashAnalytics extends Analytics {
    private readonly lightdashConfig: LightdashConfig;

    private readonly lightdashContext: Record<string, any>;

    constructor({
        lightdashConfig,
        writeKey,
        dataPlaneUrl,
        options,
    }: LightdashAnalyticsArguments) {
        super(writeKey, dataPlaneUrl, options);
        this.lightdashConfig = lightdashConfig;
        this.lightdashContext = {
            app: {
                namespace: 'lightdash',
                name: 'lightdash_server',
                version: VERSION,
                mode: lightdashConfig.mode,
                siteUrl:
                    lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? lightdashConfig.siteUrl
                        : null,
                installId: process.env.LIGHTDASH_INSTALL_ID || uuidv4(),
                installType:
                    process.env.LIGHTDASH_INSTALL_TYPE ||
                    LightdashInstallType.UNKNOWN,
            },
        };
    }

    static anonymousId = process.env.LIGHTDASH_INSTALL_ID || uuidv4();

    identify(payload: Identify) {
        if (!this.lightdashConfig.rudder.writeKey) return; // Tracking disabled

        super.identify({
            ...payload,
            context: { ...this.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
        });
    }

    track<T extends BaseTrack>(payload: TypedEvent | UntypedEvent<T>) {
        if (!this.lightdashConfig.rudder.writeKey) return; // Tracking disabled
        if (isUserUpdatedEvent(payload)) {
            const basicEventProperties = {
                is_tracking_anonymized: payload.properties.isTrackingAnonymized,
                is_marketing_opted_in: payload.properties.isMarketingOptedIn,
                job_title: payload.properties.jobTitle,
                is_setup_complete: payload.properties.isSetupComplete,
            };

            super.track({
                ...payload,
                event: `${this.lightdashContext.app.name}.${payload.event}`,
                context: { ...this.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
                properties: payload.properties.isTrackingAnonymized
                    ? basicEventProperties
                    : {
                          ...basicEventProperties,
                          email: payload.properties.email,
                          first_name: payload.properties.firstName,
                          last_name: payload.properties.lastName,
                      },
            });
            return;
        }
        if (isUserVerifiedEvent(payload)) {
            super.track({
                ...payload,
                event: `${this.lightdashContext.app.name}.${payload.event}`,
                context: { ...this.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
                properties: {
                    ...payload.properties,
                    email: payload.properties.isTrackingAnonymized
                        ? undefined
                        : payload.properties.email,
                },
            });
            return;
        }

        super.track({
            ...payload,
            event: `${this.lightdashContext.app.name}.${payload.event}`,
            context: { ...this.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
        });
    }

    group(payload: Group) {
        if (!this.lightdashConfig.rudder.writeKey) return; // Tracking disabled

        super.group({
            ...payload,
            context: { ...this.lightdashContext }, // NOTE: spread because rudderstack manipulates arg
        });
    }

    async wrapEvent<T>(
        payload: WrapTypedEvent,
        func: () => Promise<T>,
        extraProperties?: (r: T) => any,
    ) {
        try {
            this.track({
                ...payload,
                event: `${payload.event}.started`,
            });

            const results = await func();

            const properties = extraProperties ? extraProperties(results) : {};
            this.track({
                ...payload,
                event: `${payload.event}.completed`,
                properties: {
                    ...payload.properties,
                    ...properties,
                },
            });

            return results;
        } catch (e) {
            await this.track({
                ...payload,
                event: `${payload.event}.error`,
                properties: {
                    ...payload.properties,
                    error: e.message,
                },
            });
            Logger.error(`Error in scheduler task: ${e}`);
            throw e;
        }
    }
}
