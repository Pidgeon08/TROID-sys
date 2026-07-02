from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Boat, DetectionEvent, User, Operator, Request, StatusHistory, Photo, DeploymentSchedule, LandfillRecord, RecyclingRecord, SegregationRecord, AuditLog, HeatmapData
from .serializers import (
    DetectionEventSerializer, BoatSerializer, UserSerializer, OperatorSerializer,
    RequestSerializer, StatusHistorySerializer, PhotoSerializer, DeploymentScheduleSerializer,
    LandfillRecordSerializer, RecyclingRecordSerializer, SegregationRecordSerializer,
    AuditLogSerializer, HeatmapDataSerializer
)

# --- Robot / Boat endpoints (keep intact) ---

@api_view(['POST'])
def log_detection(request):
    boat_id = request.data.get('boat_id')
    lat = request.data.get('latitude')
    lng = request.data.get('longitude')
    count = request.data.get('trash_count', 1)

    if boat_id is None or lat is None or lng is None:
        return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        boat = Boat.objects.get(id=boat_id)
        boat.last_latitude = lat
        boat.last_longitude = lng
        boat.save()

        DetectionEvent.objects.create(
            boat=boat,
            latitude=lat,
            longitude=lng,
            trash_count=count
        )
        return Response({"status": "Detection logged successfully"}, status=status.HTTP_201_CREATED)
    except Boat.DoesNotExist:
        return Response({"error": "Boat not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
def get_heatmap_data(request):
    detections = DetectionEvent.objects.all()
    data = []
    for d in detections:
        weight = min(d.trash_count * 0.2, 1.0)
        data.append([d.latitude, d.longitude, weight])
    return Response(data)

# --- Generic CRUD helpers ---

def crud_list(request, model, serializer_class):
    queryset = model.objects.all()
    serializer = serializer_class(queryset, many=True)
    return Response(serializer.data)

def crud_create(request, serializer_class):
    serializer = serializer_class(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def pending_user_count(request):
    count = User.objects.filter(status='pending').count()
    return Response({"pending_count": count})

# --- Users ---

@api_view(['GET', 'POST'])
def users(request):
    if request.method == 'GET':
        return crud_list(request, User, UserSerializer)
    return crud_create(request, UserSerializer)

@api_view(['PUT', 'DELETE'])
def user_detail(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Operators ---

@api_view(['GET', 'POST'])
def operators(request):
    if request.method == 'GET':
        return crud_list(request, Operator, OperatorSerializer)
    return crud_create(request, OperatorSerializer)

@api_view(['PUT', 'DELETE'])
def operator_detail(request, pk):
    try:
        op = Operator.objects.get(pk=pk)
    except Operator.DoesNotExist:
        return Response({"error": "Operator not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        serializer = OperatorSerializer(op, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        op.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Bots ---

@api_view(['GET', 'POST'])
def bots(request):
    if request.method == 'GET':
        return crud_list(request, Boat, BoatSerializer)
    return crud_create(request, BoatSerializer)

@api_view(['PUT', 'DELETE'])
def bot_detail(request, pk):
    try:
        bot = Boat.objects.get(pk=pk)
    except Boat.DoesNotExist:
        return Response({"error": "Bot not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        serializer = BoatSerializer(bot, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        bot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Requests ---

@api_view(['GET'])
def pending_request_count(request):
    count = Request.objects.filter(status='pending').count()
    return Response({"pending_count": count})

@api_view(['GET', 'POST'])
def requests(request):
    if request.method == 'GET':
        return crud_list(request, Request, RequestSerializer)
    return crud_create(request, RequestSerializer)

@api_view(['GET', 'PUT', 'DELETE'])
def request_detail(request, pk):
    try:
        req = Request.objects.get(pk=pk)
    except Request.DoesNotExist:
        return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        serializer = RequestSerializer(req)
        return Response(serializer.data)
    elif request.method == 'PUT':
        serializer = RequestSerializer(req, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        req.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Deployment Schedules ---

@api_view(['GET', 'POST'])
def deployment_schedules(request):
    if request.method == 'GET':
        return crud_list(request, DeploymentSchedule, DeploymentScheduleSerializer)
    return crud_create(request, DeploymentScheduleSerializer)

@api_view(['PUT', 'DELETE'])
def deployment_schedule_detail(request, pk):
    try:
        ds = DeploymentSchedule.objects.get(pk=pk)
    except DeploymentSchedule.DoesNotExist:
        return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        serializer = DeploymentScheduleSerializer(ds, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        ds.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Landfill Records ---

@api_view(['GET', 'POST'])
def landfill_records(request):
    if request.method == 'GET':
        return crud_list(request, LandfillRecord, LandfillRecordSerializer)
    return crud_create(request, LandfillRecordSerializer)

@api_view(['PUT', 'DELETE'])
def landfill_record_detail(request, pk):
    try:
        rec = LandfillRecord.objects.get(pk=pk)
    except LandfillRecord.DoesNotExist:
        return Response({"error": "Record not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        serializer = LandfillRecordSerializer(rec, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        rec.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Recycling Records ---

@api_view(['GET', 'POST'])
def recycling_records(request):
    if request.method == 'GET':
        return crud_list(request, RecyclingRecord, RecyclingRecordSerializer)
    return crud_create(request, RecyclingRecordSerializer)

@api_view(['PUT', 'DELETE'])
def recycling_record_detail(request, pk):
    try:
        rec = RecyclingRecord.objects.get(pk=pk)
    except RecyclingRecord.DoesNotExist:
        return Response({"error": "Record not found"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        serializer = RecyclingRecordSerializer(rec, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        rec.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- Segregation Records ---

@api_view(['GET', 'POST'])
def segregation_records(request):
    if request.method == 'GET':
        return crud_list(request, SegregationRecord, SegregationRecordSerializer)
    return crud_create(request, SegregationRecordSerializer)

# --- Audit Logs ---

@api_view(['GET', 'POST'])
def audit_logs(request):
    if request.method == 'GET':
        return crud_list(request, AuditLog, AuditLogSerializer)
    return crud_create(request, AuditLogSerializer)

# --- Heatmap Data ---

@api_view(['GET', 'POST'])
def heatmap_data(request):
    if request.method == 'GET':
        return crud_list(request, HeatmapData, HeatmapDataSerializer)
    return crud_create(request, HeatmapDataSerializer)
